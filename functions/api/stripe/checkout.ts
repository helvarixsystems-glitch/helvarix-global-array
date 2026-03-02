export const onRequestPost: PagesFunction = async (context) => {
  const secret = context.env.STRIPE_SECRET_KEY as string;
  const appUrl = context.env.APP_URL as string;

  const { priceId, userId, email } = await context.request.json();

  if (!secret) return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });
  if (!appUrl) return new Response("Missing APP_URL", { status: 500 });
  if (!priceId) return new Response("Missing priceId", { status: 400 });
  if (!userId) return new Response("Missing userId", { status: 400 });

  // Create Checkout Session using Stripe REST API
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", `${appUrl}/collective?success=1`);
  form.set("cancel_url", `${appUrl}/collective?canceled=1`);
  form.set("client_reference_id", userId);
  if (email) form.set("customer_email", email);

  // line_items[0][price]=... & line_items[0][quantity]=1
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const text = await res.text();
  if (!res.ok) return new Response(text, { status: 500 });

  const session = JSON.parse(text);
  return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
    headers: { "Content-Type": "application/json" }
  });
};
