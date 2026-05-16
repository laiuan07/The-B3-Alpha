import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://b3alpha.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // CORS preflight — sempre retorna 200
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Autenticar usuário
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const price_id: string = body.price_id;
    const type: string = body.type ?? "payment";

    if (!price_id) {
      return new Response(JSON.stringify({ error: "price_id obrigatório" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Buscar ou criar customer_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId: string | undefined = (profile as any)?.stripe_customer_id;

    const isSubscription = type === "subscription";
    const successParam = isSubscription ? "sub_success" : "success";

    // Criar sessão Stripe via fetch direto (sem SDK — evita erros de import)
    const stripeBody: Record<string, unknown> = {
      mode: isSubscription ? "subscription" : "payment",
      "line_items[0][price]": price_id,
      "line_items[0][quantity]": "1",
      locale: "pt-BR",
      success_url: `${SITE_URL}/?payment=${successParam}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?payment=cancelled`,
      "metadata[supabase_user_id]": user.id,
      "metadata[price_id]": price_id,
      "metadata[type]": type,
    };

    if (customerId) {
      stripeBody["customer"] = customerId;
    } else {
      stripeBody["customer_email"] = user.email;
    }

    // Métodos de pagamento
    if (isSubscription) {
      stripeBody["payment_method_types[0]"] = "card";
    } else {
      stripeBody["payment_method_types[0]"] = "card";
      stripeBody["payment_method_types[1]"] = "boleto";
    }

    const formBody = Object.entries(stripeBody)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    const stripeData = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Stripe error:", stripeData);
      return new Response(JSON.stringify({ error: stripeData.error?.message ?? "Erro no Stripe" }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Salvar customer_id se for novo
    if (!customerId && stripeData.customer) {
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: stripeData.customer })
        .eq("id", user.id);
    }

    return new Response(JSON.stringify({ url: stripeData.url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
