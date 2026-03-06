import { useState } from "react";
import { startCheckout } from "../lib/stripe";

export default function Collective() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setBusy(true);
    setError(null);
    try {
      await startCheckout("REPLACE_WITH_STRIPE_PRICE_ID");
    } catch (err: any) {
      setError(err?.message ?? "Unable to start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="heroPanel">
        <div className="eyebrow">MEMBERSHIP</div>
        <h1 className="pageTitle">Helvarix Research Collective</h1>
        <p className="pageText">
          Keep the page focused on benefits, status, and the upgrade path. The user should immediately understand what paid access unlocks.
        </p>
      </section>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Premium access</div>
            <h2 className="sectionTitle">Collective membership</h2>
          </div>
          <span className="statusBadge">Stripe</span>
        </div>
        <div className="featureGrid">
          <div className="featureCard"><strong>Private campaigns</strong><span>Invite-only projects and review groups.</span></div>
          <div className="featureCard"><strong>Priority validation</strong><span>Faster triage and verification workflows.</span></div>
          <div className="featureCard"><strong>Advanced exports</strong><span>Structured datasets for archival and analysis.</span></div>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        <button className="primaryBtn" type="button" onClick={handleUpgrade} disabled={busy}>
          {busy ? "Opening Stripe…" : "Upgrade to Collective"}
        </button>
        <div className="helperText">Replace the placeholder price ID in this file with your real Stripe recurring price.</div>
      </section>
    </div>
  );
}
