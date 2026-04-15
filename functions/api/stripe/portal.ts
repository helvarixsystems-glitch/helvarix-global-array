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

async function findStripeCustomerByVerifiedEmail(
  stripeSecretKey: string,
  email: string | null
): Promise<string | null> {
  if (!email) return null;

  const searchRes = await fetch(
    `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(`email:'${email}'`)}`,
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
  const customer = Array.isArray(searchJson.data) ? searchJson.data[0] : null;

  return customer?.id ?? null;
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

    const verifiedUser = await getVerifiedUser(supabaseUrl, supabaseAnonKey, accessToken);
    const profile = await getProfileById(supabaseUrl, serviceKey, verifiedUser.id);

    let stripeCustomerId = profile?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      stripeCustomerId = await findStripeCustomerByVerifiedEmail(
        stripeSecretKey,
        verifiedUser.email
      );

      if (stripeCustomerId) {
        await patchProfileById(supabaseUrl, serviceKey, verifiedUser.id, {
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (!stripeCustomerId) {
      return json({ error: "No Stripe customer found for this account." }, 404);
    }

    const form = new URLSearchParams();
    form.set("customer", stripeCustomerId);
    form.set("return_url", `${appUrl}/collective`);

    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const portalText = await portalRes.text();
    if (!portalRes.ok) {
      return json({ error: portalText || "Unable to open billing portal." }, 500);
    }

    const portalSession = JSON.parse(portalText) as { url?: string };

    return json({ url: portalSession.url ?? null });
  } catch (error: any) {
    return json({ error: error?.message || "Server error" }, 500);
  }
};
