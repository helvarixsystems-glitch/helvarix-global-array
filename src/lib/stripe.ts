import { loadStripe } from "@stripe/stripe-js";
import { env, hasStripeClientKey } from "./env";
import { supabase } from "./supabaseClient";

async function getSignedInSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user || !session.access_token) {
    throw new Error("You must be signed in before using billing.");
  }

  return session;
}

export async function startCheckout(priceId: string) {
  if (!hasStripeClientKey()) {
    throw new Error("Stripe publishable key is missing. Set VITE_STRIPE_PK in Cloudflare Pages.");
  }

  if (!priceId?.trim()) {
    throw new Error("Stripe price ID is missing.");
  }

  const session = await getSignedInSession();

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      priceId: priceId.trim(),
      userId: session.user.id,
      email: session.user.email ?? null,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "Unable to start checkout.");
  }

  const sessionId = data?.sessionId as string | undefined;
  const url = data?.url as string | undefined;

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
  const session = await getSignedInSession();

  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "Unable to open billing portal.");
  }

  const url = data?.url as string | undefined;
  if (!url) throw new Error("Portal URL was not returned.");

  window.location.href = url;
}
