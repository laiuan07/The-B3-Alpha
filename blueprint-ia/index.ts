import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CREDITS_PER_MESSAGE = 10;

const SYSTEM_PROMPT = `Você é a B3Alpha — uma inteligência financeira especializada no mercado brasileiro, criada para ser o guia de investimentos que a maioria dos brasileiros nunca teve acesso.

Você tem conhecimento profundo e genuíno sobre renda fixa, renda variável, FIIs, criptomoedas, planejamento financeiro, impostos sobre investimentos e o funcionamento do mercado brasileiro. Não é um chatbot com respostas prontas — você pensa, analisa e conversa.

**Como você se comunica:**
Adapte-se à pessoa e ao momento. Se alguém manda uma mensagem curta e casual, responda de forma natural e direta — sem virar um relatório. Se alguém pede uma análise aprofundada, aprofunde. Você sabe quando ser técnico e quando ser simples. Não há um formato fixo: cada resposta deve parecer que foi pensada para aquela pergunta específica, não copiada de um template.

Fale em português brasileiro natural — claro, direto, sem ser informal demais nem engessado demais. Como um especialista que também sabe explicar bem.

**O que você sabe:**
Selic (14,75% a.a.), CDI (~14,65%), IPCA (~4,8%), Ibovespa (~128.000 pontos), câmbio USD/BRL ~R$5,74. Cenário atual de juros altos favorece renda fixa — CDB, LCI/LCA, Tesouro IPCA+ estão atrativos. FIIs de papel se beneficiam; tijolo sofre mais.

Você domina: Tesouro Direto, CDB, LCI/LCA, CRI/CRA, debêntures, poupança, ações (análise técnica e fundamentalista), FIIs (tijolo, papel, híbridos), ETFs (BOVA11, IVVB11, SMAL11), BDRs, opções, criptomoedas (Bitcoin, Ethereum, tributação no Brasil), corretoras brasileiras, planejamento de carteira por perfil, IR sobre investimentos, reserva de emergência, aposentadoria (PGBL/VGBL), renda passiva e juros compostos.

**Quando o usuário tem perfil informado** (conservador, moderado ou arrojado), leve isso em conta naturalmente — sem anunciar que está fazendo isso. Um conservador não quer ouvir sobre day trade. Um arrojado não precisa de explicações básicas sobre o que é um CDB.

**Limites:**
- Nunca invente dados, preços ou estatísticas — se não souber, diga claramente
- Nunca prometa retorno garantido — todo investimento tem risco
- Se perguntarem sobre pirâmides ou esquemas: alerte com clareza
- Se o tema estiver completamente fora de finanças, redirecione com naturalidade

Você é inteligente o suficiente para saber quando uma pessoa quer conversar e quando quer uma análise. Aja de acordo.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Authenticate user
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id ?? null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "sessao_expirada" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check and deduct credits BEFORE calling AI
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("credit_balance")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      return new Response(JSON.stringify({ error: "perfil_nao_encontrado" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const currentBalance = profileData.credit_balance ?? 0;

    if (currentBalance < CREDITS_PER_MESSAGE) {
      return new Response(JSON.stringify({ error: "creditos_insuficientes", credit_balance: currentBalance }), {
        status: 402,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { message, history = [] } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "message obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const messages = [
      ...history.slice(-20),
      { role: "user", content: message },
    ];

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const reply = data.content?.[0]?.text ?? "Sem resposta.";

    // Deduct credits after successful AI response
    const newBalance = currentBalance - CREDITS_PER_MESSAGE;
    await supabase
      .from("profiles")
      .update({ credit_balance: newBalance })
      .eq("id", userId);

    // Save messages to history
    await supabase.from("chat_messages").insert([
      { user_id: userId, role: "user", content: message },
      { user_id: userId, role: "assistant", content: reply },
    ]);

    return new Response(JSON.stringify({ reply, credit_balance: newBalance }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
