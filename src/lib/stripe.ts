import { loadStripe } from "@stripe/stripe-js";
import { env } from "./env";

export async function startCheckout(priceId: string) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId }),
  });
  if (!res.ok) throw new Error("Checkout session failed");
  const { sessionId } = await res.json();

  const stripe = await loadStripe(env.stripePk);
  if (!stripe) throw new Error("Stripe failed to load");

  await stripe.redirectToCheckout({ sessionId });
}

export async function openCustomerPortal() {
  const res = await fetch("/api/stripe/portal", { method: "POST" });
  if (!res.ok) throw new Error("Portal failed");
  const { url } = await res.json();
  window.location.href = url;
}
