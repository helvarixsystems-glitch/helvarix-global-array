export const onRequestPost: PagesFunction = async (context) => {
  try {
    const secret = context.env.STRIPE_SECRET_KEY as string;
    const appUrl = context.env.APP_URL as string;

    if (!secret) {
      return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });
    }

    if (!appUrl) {
      return new Response("Missing APP_URL", { status: 500 });
    }

    const body = await context.request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return new Response("Missing email", { status: 400 });
    }

    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(`email:'${email}'`)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      }
    );

    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      return new Response(searchText, { status: 500 });
    }

    const searchJson = JSON.parse(searchText);
    const customer = Array.isArray(searchJson.data) ? searchJson.data[0] : null;

    if (!customer?.id) {
      return new Response("No Stripe customer found for this email.", { status: 404 });
    }

    const form = new URLSearchParams();
    form.set("customer", customer.id);
    form.set("return_url", `${appUrl}/collective`);

    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const portalText = await portalRes.text();
    if (!portalRes.ok) {
      return new Response(portalText, { status: 500 });
    }

    const portalSession = JSON.parse(portalText);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(error?.message || "Server error", { status: 500 });
  }
};
