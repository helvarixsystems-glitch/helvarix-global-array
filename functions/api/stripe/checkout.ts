type VerifiedUser = {
  id: string;
  email: string | null;
};

type ProfileRow = {
  id: string;
  stripe_customer_id: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getAppUrl(env: Record<string, unknown>) {
  return String(env.APP_URL || env.PUBLIC_APP_URL || "").trim();
}

function getBearerToken(request: Request) {
  const auth = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function getVerifiedUser(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string
): Promise<VerifiedUser> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error("Unable to verify signed-in user.");
  }

  const user = (await res.json()) as { id?: string; email?: string | null };

  if (!user?.id) {
    throw new Error("Authenticated user was not returned by Supabase.");
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

async function getProfileById(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<ProfileRow | null> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(
    userId
  )}&select=id,stripe_customer_id`;

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

  const rows = (await res.json()) as ProfileRow[];
  return rows?.[0] ?? null;
}

async function patchProfileById(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  patch: Record<string, unknown>
) {
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

async function ensureStripeCustomer(
  stripeSecretKey: string,
  verifiedUser: VerifiedUser,
  existingCustomerId: string | null
) {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  if (verifiedUser.email) {
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(
        `email:'${verifiedUser.email}'`
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      throw new Error(searchText || "Unable to search Stripe customers.");
    }

    const searchJson = JSON.parse(searchText) as { data?: Array<{ id?: string }> };
    const existing = Array.isArray(searchJson.data) ? searchJson.data[0] : null;

    if (existing?.id) {
      return existing.id;
    }
  }

  const form = new URLSearchParams();
  if (verifiedUser.email) {
    form.set("email", verifiedUser.email);
  }

  form.set("metadata[supabase_user_id]", verifiedUser.id);
  form.set("metadata[plan]", "research_collective");
  form.set("metadata[app]", "helvarix-global-array");

  const createRes = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    throw new Error(createText || "Unable to create Stripe customer.");
  }

  const customer = JSON.parse(createText) as { id?: string };
  if (!customer?.id) {
    throw new Error("Stripe customer ID was not returned.");
  }

  return customer.id;
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const stripeSecretKey = String(context.env.STRIPE_SECRET_KEY || "").trim();
    const appUrl = getAppUrl(context.env);
    const supabaseUrl = String(context.env.SUPABASE_URL || "").trim();
    const supabaseAnonKey = String(context.env.SUPABASE_ANON_KEY || "").trim();
    const serviceKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!stripeSecretKey) return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
    if (!appUrl) return json({ error: "Missing APP_URL or PUBLIC_APP_URL" }, 500);
    if (!supabaseUrl) return json({ error: "Missing SUPABASE_URL" }, 500);
    if (!supabaseAnonKey) return json({ error: "Missing SUPABASE_ANON_KEY" }, 500);
    if (!serviceKey) return json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const accessToken = getBearerToken(context.request);
    if (!accessToken) {
      return json({ error: "Missing Authorization bearer token" }, 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as {
      priceId?: string;
      userId?: string;
      email?: string;
    };

    const priceId = String(body.priceId || "").trim();
    if (!priceId) {
      return json({ error: "Missing priceId" }, 400);
    }

    const verifiedUser = await getVerifiedUser(supabaseUrl, supabaseAnonKey, accessToken);

    if (body.userId && body.userId !== verifiedUser.id) {
      return json({ error: "Authenticated user does not match requested user." }, 403);
    }

    if (body.email && verifiedUser.email && body.email !== verifiedUser.email) {
      return json({ error: "Authenticated email does not match requested email." }, 403);
    }

    const profile = await getProfileById(supabaseUrl, serviceKey, verifiedUser.id);
    const stripeCustomerId = await ensureStripeCustomer(
      stripeSecretKey,
      verifiedUser,
      profile?.stripe_customer_id ?? null
    );

    if (profile?.stripe_customer_id !== stripeCustomerId) {
      await patchProfileById(supabaseUrl, serviceKey, verifiedUser.id, {
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString(),
      });
    }

    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("customer", stripeCustomerId);
    form.set("success_url", `${appUrl}/collective?success=1`);
    form.set("cancel_url", `${appUrl}/collective?canceled=1`);
    form.set("client_reference_id", verifiedUser.id);

    form.set("line_items[0][price]", priceId);
    form.set("line_items[0][quantity]", "1");

    form.set("metadata[supabase_user_id]", verifiedUser.id);
    form.set("metadata[plan]", "research_collective");
    form.set("metadata[app]", "helvarix-global-array");

    form.set("subscription_data[metadata][supabase_user_id]", verifiedUser.id);
    form.set("subscription_data[metadata][plan]", "research_collective");
    form.set("subscription_data[metadata][app]", "helvarix-global-array");

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const text = await res.text();
    if (!res.ok) {
      return json({ error: text || "Stripe checkout session creation failed." }, 500);
    }

    const session = JSON.parse(text) as { id?: string; url?: string };

    return json({
      sessionId: session.id ?? null,
      url: session.url ?? null,
    });
  } catch (error: any) {
    return json({ error: error?.message || "Server error" }, 500);
  }
};
