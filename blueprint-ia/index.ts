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

**Skill: Observador de Carteira**
Quando o cliente tem dados de patrimônio registrados, você age como uma observadora ativa da carteira — não um chatbot genérico:
- Conhece cada classe de ativo e os valores reais do cliente
- Conecta CADA resposta com a situação financeira concreta do cliente
- Identifica oportunidades: falta de diversificação, concentração excessiva, ausência de reserva
- Acompanha progresso em relação às metas declaradas
- Tom: cuidado e observação — como uma sócia que se importa, não um fiscal que cobra

Bom tom: "Vi que você tem R$ 25k em FIIs — está bem alinhado com o objetivo de renda passiva. Quer analisar a alocação por tipo (papel vs tijolo)?"
Mau tom: "Você aportou pouco." (julgamento)

**Quando o usuário tem perfil informado** (conservador, moderado ou arrojado), leve isso em conta naturalmente — sem anunciar que está fazendo isso.

**Quando há dados de carteira na seção "CARTEIRA E SITUAÇÃO FINANCEIRA"**, use esses dados para PERSONALIZAR completamente a resposta. Mencione valores reais, faça cálculos com os números concretos, conecte a pergunta com a situação real do cliente. NUNCA invente valores ou ativos que o cliente não informou.

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

// Build patrimônio context block from DB row
function buildPatrimonioContext(p: Record<string, unknown>): string {
  const hasData = p.renda_mensal || p.renda_fixa || p.acoes || p.fiis || p.reserva;
  if (!hasData) return "";

  const fmt = (v: unknown) =>
    v ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : null;

  const lines: string[] = ["\n\n## CARTEIRA E SITUAÇÃO FINANCEIRA DO CLIENTE"];
  if (p.idade) lines.push(`- Idade: ${p.idade} anos`);
  if (p.perfil) lines.push(`- Perfil: ${p.perfil}`);
  if (p.objetivo) {
    const objMap: Record<string, string> = {
      reserva: "Construir reserva de emergência",
      aposentadoria: "Aposentadoria antecipada",
      imovel: "Comprar imóvel",
      renda: "Viver de renda passiva",
      crescimento: "Crescimento patrimonial",
      liberdade: "Liberdade financeira completa",
    };
    lines.push(`- Objetivo: ${objMap[p.objetivo as string] ?? p.objetivo}`);
  }
  if (p.prazo) {
    const prazoMap: Record<string, string> = {
      curto: "até 2 anos",
      medio: "3 a 5 anos",
      longo: "5 a 10 anos",
      muitolongo: "mais de 10 anos",
    };
    lines.push(`- Prazo: ${prazoMap[p.prazo as string] ?? p.prazo}`);
  }
  if (p.renda_mensal) lines.push(`- Renda mensal: ${fmt(p.renda_mensal)}`);
  if (p.gastos_mensais) lines.push(`- Gastos mensais: ${fmt(p.gastos_mensais)}`);
  if (p.sobra_mensal) lines.push(`- Sobra mensal: ${fmt(p.sobra_mensal)}`);

  lines.push("\n**Patrimônio atual:**");
  if (p.reserva) lines.push(`- Reserva de emergência: ${fmt(p.reserva)}`);
  if (p.renda_fixa) lines.push(`- Renda Fixa (CDB/Tesouro/LCI): ${fmt(p.renda_fixa)}`);
  if (p.acoes) lines.push(`- Ações: ${fmt(p.acoes)}`);
  if (p.fiis) lines.push(`- FIIs: ${fmt(p.fiis)}`);
  if (p.cripto) lines.push(`- Criptomoedas: ${fmt(p.cripto)}`);
  if (p.imoveis) lines.push(`- Imóveis: ${fmt(p.imoveis)}`);

  const dividas = p.dividas as Array<{ tipo: string; valor: number }> | null;
  if (dividas && dividas.length > 0) {
    lines.push("\n**Dívidas:**");
    const divNomes: Record<string, string> = {
      cartao: "Cartão de crédito",
      finimovel: "Financiamento imóvel",
      emprestimos: "Empréstimos",
    };
    dividas.forEach((d) => lines.push(`- ${divNomes[d.tipo] ?? d.tipo}: ${fmt(d.valor)}`));
  }

  lines.push(
    "\nUse esses dados para PERSONALIZAR completamente cada resposta. " +
    "Conecte tudo com a situação real do cliente. " +
    "NUNCA invente valores ou ativos além dos informados acima."
  );
  return lines.join("\n");
}

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

    const body = await req.json();
    const { mode } = body;

    // ── MODE: extract_memory ──────────────────────────────────────
    if (mode === "extract_memory") {
      const { conversation, existingMemory = "" } = body;
      if (!conversation || conversation.length < 4) {
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      }
      const extractPrompt = `Você vai analisar uma conversa entre um usuário e a IA financeira B3Alpha.

Extraia APENAS fatos concretos e duradouros sobre o usuário que seriam úteis em conversas futuras — coisas que ele mencionou sobre si mesmo, seus investimentos, objetivos, medos, situação financeira ou conhecimento.

Memória atual do usuário (já registrada):
${existingMemory || "(nenhuma ainda)"}

Conversa:
${conversation.map((m: {role:string,content:string}) => `${m.role === "user" ? "Usuário" : "IA"}: ${m.content}`).join("\n")}

Retorne APENAS uma lista de bullets curtos com os novos fatos aprendidos (que ainda não estão na memória atual). Se não houver nada novo relevante, retorne exatamente: NENHUM`;

      const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: extractPrompt }],
        }),
      });

      if (extractRes.ok) {
        const extractData = await extractRes.json();
        const newFacts = extractData.content?.[0]?.text ?? "";
        if (newFacts && newFacts.trim() !== "NENHUM") {
          const updatedMemory = [existingMemory, newFacts].filter(Boolean).join("\n").trim();
          await supabase.from("profiles").update({ ai_memory: updatedMemory }).eq("id", userId);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── MODE: chat (default) ──────────────────────────────────────
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

    // Load persistent AI memory
    let aiMemory = "";
    try {
      const { data: memData } = await supabase
        .from("profiles")
        .select("ai_memory")
        .eq("id", userId)
        .single();
      aiMemory = (memData as any)?.ai_memory ?? "";
    } catch (_) { /* column may not exist yet */ }

    // Load patrimônio for dynamic system prompt enrichment
    let patrimonioCtx = "";
    try {
      const { data: patData } = await supabase
        .from("patrimonio")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (patData) {
        patrimonioCtx = buildPatrimonioContext(patData as Record<string, unknown>);
      }
    } catch (_) { /* table may not exist yet — silently skip */ }

    const { message, history = [], imageData } = body;

    if (!message && !imageData) {
      return new Response(JSON.stringify({ error: "message obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build full system prompt: base + patrimônio context + memory
    const memoryBlock = aiMemory
      ? `\n\n[O que você já sabe sobre este usuário de conversas anteriores]\n${aiMemory}`
      : "";
    const systemWithContext = SYSTEM_PROMPT + patrimonioCtx + memoryBlock;

    // Build user message content — multimodal when image is present
    let userContent: unknown;
    if (imageData?.base64 && imageData?.mediaType && (imageData.mediaType as string).startsWith("image/")) {
      userContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.base64,
          },
        },
        { type: "text", text: message || "Analise este gráfico." },
      ];
    } else {
      userContent = message;
    }

    const messages = [
      ...history.slice(-20),
      { role: "user", content: userContent },
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
        system: systemWithContext,
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

    // Deduct credits after successful response
    const newBalance = currentBalance - CREDITS_PER_MESSAGE;
    await supabase
      .from("profiles")
      .update({ credit_balance: newBalance })
      .eq("id", userId);

    // Save messages to history
    await supabase.from("chat_messages").insert([
      { user_id: userId, role: "user", content: typeof message === "string" ? message : "[imagem/arquivo]" },
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
