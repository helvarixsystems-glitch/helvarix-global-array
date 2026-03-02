import Stripe from "stripe";

export const onRequestPost: PagesFunction = async (context) => {
  const stripe = new Stripe(context.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-06-20",
  });

  const { priceId } = await context.request.json();

  // Identify the logged-in user via Supabase JWT (sent by browser cookies)
  // For beta simplicity, we’ll create session without user binding here.
  // Next step: pass userId/email from Supabase session to attach customer.

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${context.env.APP_URL}/collective`,
    cancel_url: `${context.env.APP_URL}/collective`,
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ sessionId: session.id }), {
    headers: { "Content-Type": "application/json" },
  });
};
