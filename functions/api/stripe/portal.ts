import Stripe from "stripe";

export const onRequestPost: PagesFunction = async (context) => {
  const stripe = new Stripe(context.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-06-20",
  });

  // In the next iteration we’ll look up stripe_customer_id from Supabase profile.
  // For now, this endpoint requires you to have customer id lookup logic.
  return new Response(
    JSON.stringify({ url: `${context.env.APP_URL}/profile` }),
    { headers: { "Content-Type": "application/json" } }
  );
};
