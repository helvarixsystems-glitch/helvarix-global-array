async function hmacSha256(key: string, msg: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

export const onRequestPost: PagesFunction = async (context) => {
  const webhookSecret = String(context.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const supabaseUrl = String(context.env.SUPABASE_URL || "").trim();
  const serviceKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!webhookSecret) {
    return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
  }

  if (!supabaseUrl || !serviceKey) {
    return new Response("Missing Supabase env vars", { status: 500 });
  }

  const sigHeader = context.request.headers.get("stripe-signature");
  if (!sigHeader) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const rawBody = await context.request.text();

  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(",")) {
    const [key, value] = piece.split("=");
    if (key && value) {
      parts[key.trim()] = value.trim();
    }
  }

  const t = parts.t;
  const v1 = parts.v1;

  if (!t || !v1) {
    return new Response("Invalid signature header", { status: 400 });
  }

  const timestampSeconds = Number(t);
  if (!Number.isFinite(timestampSeconds)) {
    return new Response("Invalid signature timestamp", { status: 400 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const toleranceSeconds = 300;

  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return new Response("Webhook timestamp outside tolerance", { status: 400 });
  }

  const signedPayload = `${t}.${rawBody}`;
  const expected = await hmacSha256(webhookSecret, signedPayload);

  if (!timingSafeEqual(expected, v1)) {
    return new Response("Bad signature", { status: 400 });
  }

  const event = JSON.parse(rawBody);

  async function patchProfileById(userId: string, patch: Record<string, any>) {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(
      userId
    )}`;

    const res = await fetch(url, {
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
      throw new Error(await res.text());
    }
  }

  async function findProfileBySubscription(subId: string) {
    const url = `${supabaseUrl.replace(
      /\/$/,
      ""
    )}/rest/v1/profiles?stripe_subscription_id=eq.${encodeURIComponent(subId)}&select=id`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const rows = await res.json();
    return rows?.[0]?.id as string | undefined;
  }

  async function findProfileByCustomer(customerId: string) {
    const url = `${supabaseUrl.replace(
      /\/$/,
      ""
    )}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const rows = await res.json();
    return rows?.[0]?.id as string | undefined;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId =
        session?.metadata?.supabase_user_id ||
        session?.client_reference_id ||
        undefined;

      if (userId) {
        const paid =
          session?.payment_status === "paid" ||
          session?.status === "complete";

        await patchProfileById(userId, {
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: session.subscription ?? null,
          subscription_status: paid ? "active" : "incomplete",
          plan: "research_collective",
          guild_access: paid,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;
      const isActive = sub.status === "active" || sub.status === "trialing";

      let userId = sub.metadata?.supabase_user_id as string | undefined;

      if (!userId && sub.id) {
        userId = await findProfileBySubscription(sub.id);
      }

      if (!userId && sub.customer) {
        userId = await findProfileByCustomer(String(sub.customer));
      }

      if (userId) {
        await patchProfileById(userId, {
          stripe_customer_id: sub.customer ?? null,
          stripe_subscription_id: sub.id ?? null,
          subscription_status: sub.status ?? null,
          plan: "research_collective",
          guild_access: isActive,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = invoice?.subscription ? String(invoice.subscription) : "";
      const customerId = invoice?.customer ? String(invoice.customer) : "";

      let userId: string | undefined;

      if (subscriptionId) {
        userId = await findProfileBySubscription(subscriptionId);
      }

      if (!userId && customerId) {
        userId = await findProfileByCustomer(customerId);
      }

      if (userId) {
        await patchProfileById(userId, {
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null,
          subscription_status: "past_due",
          plan: "research_collective",
          guild_access: false,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (e: any) {
    return new Response(`Webhook handler error: ${e.message}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
};
