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

export const onRequestPost: PagesFunction = async (context) => {
  const webhookSecret = context.env.STRIPE_WEBHOOK_SECRET as string;
  const supabaseUrl = context.env.SUPABASE_URL as string;
  const serviceKey = context.env.SUPABASE_SERVICE_ROLE_KEY as string;

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

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=").map((s) => s.trim()))
  );

  const t = parts["t"];
  const v1 = parts["v1"];

  if (!t || !v1) {
    return new Response("Invalid signature header", { status: 400 });
  }

  const signedPayload = `${t}.${rawBody}`;
  const expected = await hmacSha256(webhookSecret, signedPayload);

  if (expected.length !== v1.length) {
    return new Response("Bad signature", { status: 400 });
  }

  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }

  if (ok !== 0) {
    return new Response("Bad signature", { status: 400 });
  }

  const event = JSON.parse(rawBody);

  async function patchProfileById(userId: string, patch: Record<string, any>) {
    const url = `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`;

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
    const url = `${supabaseUrl}/rest/v1/profiles?stripe_subscription_id=eq.${subId}&select=id`;

    const res = await fetch(url, {
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
      const userId = session.metadata?.supabase_user_id;

      if (userId) {
        await patchProfileById(userId, {
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: session.subscription ?? null,
          subscription_status: "active",
          plan: "research_collective",
          guild_access: true,
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

      let userId = sub.metadata?.supabase_user_id;

      if (!userId && sub.id) {
        userId = await findProfileBySubscription(sub.id);
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
  } catch (e: any) {
    return new Response(`Webhook handler error: ${e.message}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
};
