import Stripe from "stripe";

interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_ID: string;
  PUBLIC_APP_URL: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const stripe = new Stripe(context.env.STRIPE_SECRET_KEY);

    const body = (await context.request.json()) as {
      userId?: string;
      email?: string;
    };

    const userId = body.userId;
    const email = body.email;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: context.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${context.env.PUBLIC_APP_URL}/billing/success`,
      cancel_url: `${context.env.PUBLIC_APP_URL}/billing/cancel`,
      customer_email: email,

      metadata: {
        supabase_user_id: userId,
        plan: "research_collective",
        app: "helvarix-global-array",
      },

      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          plan: "research_collective",
          app: "helvarix-global-array",
        },
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Server error" }),
      { status: 500 }
    );
  }
};
