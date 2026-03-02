import Stripe from "stripe";

export const onRequestPost: PagesFunction = async (context) => {
  const stripe = new Stripe(context.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-06-20",
  });

  const sig = context.request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const body = await context.request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      context.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Supabase admin client (service role)
  const supabaseUrl = context.env.SUPABASE_URL as string;
  const serviceKey = context.env.SUPABASE_SERVICE_ROLE_KEY as string;

  async function supabaseAdminUpdate(userId: string, patch: any) {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t);
    }
  }

  // ✅ Beta approach:
  // You NEED a way to connect Stripe customer/subscription -> your Supabase user.
  // The standard way is: when creating checkout, include client_reference_id = userId,
  // then in webhook read it back and update that user’s profile.
  //
  // We’ll enforce that now.

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.client_reference_id; // must be set during checkout
    if (userId) {
      await supabaseAdminUpdate(userId, {
        is_pro: true,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;

    // You would map subscription -> userId by looking up profiles where stripe_subscription_id = sub.id
    // For beta: you can do a REST query to find user and update is_pro accordingly.
    const isActive = sub.status === "active" || sub.status === "trialing";

    const findRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?stripe_subscription_id=eq.${sub.id}&select=id`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    const rows = (await findRes.json()) as Array<{ id: string }>;
    const userId = rows?.[0]?.id;

    if (userId) {
      await supabaseAdminUpdate(userId, {
        is_pro: isActive,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return new Response("ok", { status: 200 });
};
