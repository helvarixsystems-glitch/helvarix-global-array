import { loadStripe } from "@stripe/stripe-js";
import { env, hasStripeClientKey } from "./env";
import { supabase } from "./supabaseClient";

export async function startCheckout(priceId: string) {
  if (!hasStripeClientKey()) {
    throw new Error("Stripe publishable key is missing. Set VITE_STRIPE_PK in Cloudflare Pages.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in before starting checkout.");
  }

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      userId: session.user.id,
      email: session.user.email,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const { sessionId, url } = await res.json();
  const stripe = await loadStripe(env.stripePk);

  if (stripe && sessionId) {
    const result = await stripe.redirectToCheckout({ sessionId });
    if (result.error) throw result.error;
    return;
  }

  if (url) {
    window.location.href = url;
    return;
  }

  throw new Error("Unable to open Stripe checkout.");
}

export async function openCustomerPortal() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("You must be signed in before opening the billing portal.");
  }

  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: session.user.email,
      userId: session.user.id,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const { url } = await res.json();
  if (!url) throw new Error("Portal URL was not returned.");
  window.location.href = url;
}
