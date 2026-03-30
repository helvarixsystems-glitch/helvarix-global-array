export const onRequestPost: PagesFunction = async (context) => {
  try {
    const stripeSecretKey = context.env.STRIPE_SECRET_KEY as string;
    const stripePriceId = context.env.STRIPE_PRICE_ID as string;
    const publicAppUrl = context.env.PUBLIC_APP_URL as string;

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!stripePriceId) {
      return new Response(
        JSON.stringify({ error: "Missing STRIPE_PRICE_ID" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!publicAppUrl) {
      return new Response(
        JSON.stringify({ error: "Missing PUBLIC_APP_URL" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = (await context.request.json()) as {
      userId?: string;
      email?: string;
    };

    const userId = body.userId;
    const email = body.email;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("line_items[0][price]", stripePriceId);
    form.set("line_items[0][quantity]", "1");
    form.set("success_url", `${publicAppUrl}/billing/success`);
    form.set("cancel_url", `${publicAppUrl}/billing/cancel`);

    if (email) {
      form.set("customer_email", email);
    }

    form.set("metadata[supabase_user_id]", userId);
    form.set("metadata[plan]", "research_collective");
    form.set("metadata[app]", "helvarix-global-array");

    form.set("subscription_data[metadata][supabase_user_id]", userId);
    form.set("subscription_data[metadata][plan]", "research_collective");
    form.set("subscription_data[metadata][app]", "helvarix-global-array");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const stripeData = await stripeRes.json<any>();

    if (!stripeRes.ok) {
      return new Response(
        JSON.stringify({
          error: stripeData?.error?.message || "Stripe session creation failed",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ url: stripeData.url }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
