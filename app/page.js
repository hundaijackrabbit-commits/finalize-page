const features = [
  ['01', 'Catch what is still missing', 'Finalize turns the vague “are we done?” moment into a concrete closeout list: missing files, unanswered decisions, unsigned approvals and loose ends.'],
  ['02', 'Get the right people to approve', 'Invite clients, collaborators or internal reviewers into one clean room instead of chasing confirmations through scattered email threads.'],
  ['03', 'Close the loop', 'Move from review to approval, signature, payment and archive without losing the record of who decided what and when.'],
];

const useCases = ['Client approvals', 'Contract closeout', 'Project handoff', 'Vendor onboarding', 'Launch readiness', 'Policy sign-off', 'Creative review', 'Deal rooms'];

export default function Home() {
  return (
    <main>
      <div className="shell">
        <nav className="nav">
          <a href="#" className="brand"><span className="brandmark">✓</span> finalize</a>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="/app" className="btn btn-dark">Open demo</a>
          </div>
        </nav>

        <section className="hero">
          <div>
            <div className="eyebrow"><span className="dot" /> The last mile between almost done and done</div>
            <h1>Finish what work starts.</h1>
            <p>Finalize gives every important piece of work a clean ending: the missing details, approvals, signatures, payments and handoffs that usually get scattered across five different tools.</p>
            <div className="hero-actions">
              <a href="/app" className="btn btn-dark">Try a Finalize Room →</a>
              <a href="#how" className="btn btn-light">See how it works</a>
            </div>
            <div className="micro">Built for client work, contracts, launches and closeout. Not a law firm or a substitute for legal advice.</div>
          </div>

          <div className="demo">
            <div className="windowbar"><div className="dots"><span/><span/><span/></div><span>finalize.page/rooms/acme-redesign</span></div>
            <div className="demo-card">
              <div className="demo-top"><div><div className="kicker">Finalize room</div><h3>Acme website launch</h3></div><span className="status">Almost ready</span></div>
              <div className="progress-wrap"><div className="progress-meta"><span>Completion</span><strong>76%</strong></div><div className="progress"><i /></div></div>
              <div className="checklist">
                <div className="check"><span className="checkmark">✓</span> Final copy approved <b>Client</b></div>
                <div className="check"><span className="checkmark">✓</span> Mobile QA completed <b>Team</b></div>
                <div className="check"><span className="checkmark open">!</span> Domain access needed <b>Client</b></div>
                <div className="check"><span className="checkmark open">•</span> Final invoice unpaid <b>$1,240</b></div>
              </div>
              <div className="demo-footer"><div className="avatars"><span className="avatar">HS</span><span className="avatar">AK</span><span className="avatar">LM</span></div><button className="btn btn-accent">Request final approval</button></div>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="section-label">A better ending for work</div>
          <h2>One room for everything that still needs to happen.</h2>
          <p className="lead">Projects rarely fail because nobody did the work. They drag because the final 10% lives in emails, DMs, documents, invoices, signature tools and somebody’s memory.</p>
          <div className="grid3">
            {features.map(([n,t,d]) => <article className="feature" key={n}><div className="num">{n}</div><h3>{t}</h3><p>{d}</p></article>)}
          </div>
          <div className="band">
            <div><h3>Start horizontal. Win a vertical later.</h3><p>Finalize is broad enough to own closeout, but the first wedge can be client-service businesses and contracts: high-friction work where “done” has real financial value.</p></div>
            <div className="usecases">{useCases.map(x => <span className="pill" key={x}>{x}</span>)}</div>
          </div>
        </section>

        <section className="section">
          <div className="section-label">Why not just legal tech?</div>
          <h2>Legal can be a feature set, not the whole identity.</h2>
          <p className="lead">A pure legal app immediately raises the bar on trust, jurisdiction, compliance and liability. Finalize can still make contracts a killer workflow: detect missing fields, flag unresolved terms, route approvals and signatures, and preserve an audit trail—without pretending to be a lawyer.</p>
        </section>

        <section className="section" id="pricing">
          <div className="section-label">Simple SaaS model</div>
          <h2>Charge for active work getting finished.</h2>
          <div className="pricing">
            <div className="price"><h3>Free</h3><strong>$0</strong><p>For trying the workflow.</p><ul><li>3 active rooms</li><li>Basic checklists</li><li>Guest approvals</li></ul><a href="/app" className="btn btn-light">Start free</a></div>
            <div className="price featured"><h3>Pro</h3><strong>$15</strong><p>per month, suggested launch price</p><ul><li>Unlimited rooms</li><li>Templates</li><li>AI closeout review</li><li>Signatures + payment links</li></ul><a href="/app" className="btn btn-accent">Try Pro</a></div>
            <div className="price"><h3>Team</h3><strong>$49</strong><p>per workspace / month</p><ul><li>Shared templates</li><li>Roles + permissions</li><li>Audit log</li><li>Branding</li></ul><a href="mailto:hello@finalize.page" className="btn btn-light">Talk to us</a></div>
          </div>
        </section>

        <section className="cta"><div className="ctabox"><div><h2>Stop leaving work at 95%.</h2><p>Create a Finalize Room, see what is missing, get the final yes, and close the loop.</p></div><a href="/app" className="btn btn-dark">Open the working demo →</a></div></section>

        <footer><div className="footerrow"><span>© 2026 Finalize.page</span><span>Almost done is not done.</span></div></footer>
      </div>
    </main>
  );
}
