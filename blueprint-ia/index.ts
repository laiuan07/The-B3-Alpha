import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CREDITS_PER_MESSAGE = 10;

// ── AGENT TYPES ────────────────────────────────────────────────
type AgentType = "carteira" | "mercado" | "planejamento" | "geral";

// ── CORS ───────────────────────────────────────────────────────
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── BASE IDENTITY (shared by all agents) ──────────────────────
const BASE_IDENTITY = `Você é a B3Alpha — uma inteligência financeira especializada no mercado brasileiro, criada para ser o guia de investimentos que a maioria dos brasileiros nunca teve acesso.

Fale em português brasileiro natural — claro, direto, sem ser informal demais nem engessado demais. Adapte-se ao momento: resposta curta para pergunta casual, análise aprofundada quando pedido.

**Limites:**
- Nunca invente dados, preços ou estatísticas — se não souber, diga claramente
- Nunca prometa retorno garantido — todo investimento tem risco
- Se perguntarem sobre pirâmides ou esquemas: alerte com clareza
- Se o tema estiver completamente fora de finanças, redirecione com naturalidade`;

// ── SPECIALIZED SYSTEM PROMPTS ─────────────────────────────────
const AGENT_PROMPTS: Record<AgentType, string> = {

  carteira: `${BASE_IDENTITY}

**Sua especialidade: Analista de Carteira**
Você é o especialista na carteira pessoal do usuário. Quando o cliente tem dados registrados:
- Conhece cada ativo, preço médio (PM), quantidade e valor total exato
- Faz cálculos precisos: PM ponderado, variação percentual, stop loss ideal, rentabilidade atual
- Identifica concentração excessiva em um setor ou ativo específico
- Compara a carteira com o perfil de risco declarado (conservador/moderado/arrojado)
- Sugere aportes com base na sobra mensal informada e nos objetivos declarados
- Avalia necessidade de rebalanceamento e como fazer
- Tom: como uma sócia que conhece bem a situação — cuidado genuíno, sem julgamento`,

  mercado: `${BASE_IDENTITY}

**Sua especialidade: Analista de Mercado**
Você é o especialista em análise de mercado e ativos brasileiros. Você:
- Analisa ações com fundamentos: P/L, P/VP, ROE, dívida/EBITDA, dividend yield, crescimento de receita
- Analisa FIIs: P/VP, DY últimos 12 meses, vacância, tipo (papel/tijolo/híbrido), qualidade do portfólio
- Domina o contexto macro atual: Selic 14,75% a.a., CDI ~14,65%, IPCA ~4,8%, Ibovespa ~128.000, USD/BRL ~R$5,74
- Analisa gráficos quando o usuário envia imagem: suportes, resistências, tendência, médias móveis, volume, padrões
- Cobre ETFs (BOVA11, IVVB11, SMAL11), BDRs, opções, criptomoedas (Bitcoin, Ethereum, tributação BR)
- Cobre renda fixa: Tesouro Direto, CDB, LCI/LCA, CRI/CRA, debêntures — comparando com Selic/CDI atual
- Quando o cliente tem carteira registrada, conecta a análise com os ativos que ele já possui`,

  planejamento: `${BASE_IDENTITY}

**Sua especialidade: Planejador Financeiro**
Você é o especialista em estratégia e planejamento financeiro de longo prazo. Você:
- Monta e revisa metas financeiras com prazos e valores realistas
- Calcula juros compostos, projeções de patrimônio e tempo para aposentadoria com números reais
- Orienta sobre IR em investimentos: quando recolher DARF, isenções (ações até R$20k/mês), come-cotas, como declarar
- Explica e compara PGBL vs VGBL, previdência privada vs Tesouro IPCA+
- Define reserva de emergência ideal (6 a 12 meses de gastos) e onde guardar
- Orienta gestão de dívidas: qual pagar primeiro, quando vale refinanciar
- Monta estratégias por perfil e por objetivo (renda passiva, crescimento, aposentadoria antecipada)
- Quando o cliente tem dados registrados, usa a situação financeira real para projeções e cenários concretos`,

  geral: `${BASE_IDENTITY}

**Como você se comunica:**
Adapte-se à pessoa e ao momento. Se alguém manda uma mensagem curta e casual, responda de forma natural e direta — sem virar um relatório. Se alguém pede uma análise aprofundada, aprofunde.

Você domina: Tesouro Direto, CDB, LCI/LCA, CRI/CRA, debêntures, poupança, ações (análise técnica e fundamentalista), FIIs (tijolo, papel, híbridos), ETFs, BDRs, opções, criptomoedas, corretoras brasileiras, planejamento de carteira por perfil, IR sobre investimentos, reserva de emergência, aposentadoria (PGBL/VGBL), renda passiva e juros compostos.

Quando o cliente tem dados de carteira ou perfil registrados, use esses dados para personalizar a resposta.`,
};

// ── ANTHROPIC HELPER ──────────────────────────────────────────
async function callAnthropic(
  model: string,
  system: string,
  messages: unknown[],
  maxTokens = 2048,
): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
}

// ── ROUTER AGENT (Haiku — rápido e barato) ────────────────────
async function routeMessage(message: string, hasPatrimonio: boolean): Promise<AgentType> {
  const prompt = `Classifique a pergunta financeira abaixo em UMA das quatro categorias:

carteira  → pergunta sobre a carteira/portfólio pessoal do usuário (preço médio, meus ativos, minha posição, aportar, rebalancear)
mercado   → análise de mercado, cotações, fundamentos de ações/FIIs, criptomoedas, macroeconomia, análise de gráfico
planejamento → metas financeiras, aposentadoria, orçamento, imposto de renda, estratégia de longo prazo, dívidas
geral     → saudações, perguntas conceituais básicas ou qualquer coisa que não se encaixe acima

${hasPatrimonio ? "Contexto: este usuário possui carteira de investimentos registrada no sistema.\n" : ""}Pergunta: "${message}"

Responda APENAS com uma palavra: carteira, mercado, planejamento ou geral`;

  try {
    const res = await callAnthropic(
      "claude-haiku-4-5-20251001",
      "",
      [{ role: "user", content: prompt }],
      10,
    );
    if (!res.ok) return "geral";
    const data = await res.json();
    const answer = (data.content?.[0]?.text ?? "geral").trim().toLowerCase();
    const valid: AgentType[] = ["carteira", "mercado", "planejamento", "geral"];
    return valid.includes(answer as AgentType) ? (answer as AgentType) : "geral";
  } catch (_) {
    return "geral";
  }
}

// ── PATRIMÔNIO CONTEXT ────────────────────────────────────────
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
    "NUNCA invente valores ou ativos além dos informados acima.",
  );
  return lines.join("\n");
}

// ── MAIN HANDLER ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Authenticate ───────────────────────────────────────────
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

    // ── MODE: extract_memory ───────────────────────────────────
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
${conversation.map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuário" : "IA"}: ${m.content}`).join("\n")}

Retorne APENAS uma lista de bullets curtos com os novos fatos aprendidos (que ainda não estão na memória atual). Se não houver nada novo relevante, retorne exatamente: NENHUM`;

      const extractRes = await callAnthropic(
        "claude-haiku-4-5-20251001",
        "",
        [{ role: "user", content: extractPrompt }],
        400,
      );
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

    // ── MODE: chat (default) ───────────────────────────────────

    // Check credits
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
      return new Response(
        JSON.stringify({ error: "creditos_insuficientes", credit_balance: currentBalance }),
        { status: 402, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Load AI memory
    let aiMemory = "";
    try {
      const { data: memData } = await supabase
        .from("profiles")
        .select("ai_memory")
        .eq("id", userId)
        .single();
      aiMemory = (memData as any)?.ai_memory ?? "";
    } catch (_) { /* column may not exist yet */ }

    // Load patrimônio
    let patrimonioCtx = "";
    try {
      const { data: patData } = await supabase
        .from("patrimonio")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (patData) patrimonioCtx = buildPatrimonioContext(patData as Record<string, unknown>);
    } catch (_) { /* table may not exist yet */ }

    const { message, history = [], imageData } = body;

    if (!message && !imageData) {
      return new Response(JSON.stringify({ error: "message obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── ROUTE: decide which specialist agent to use ────────────
    // Images always go to the market analyst (chart analysis)
    const agentType: AgentType = imageData
      ? "mercado"
      : await routeMessage(message ?? "", !!patrimonioCtx);

    // Build system prompt for the chosen agent
    const memoryBlock = aiMemory
      ? `\n\n[O que você já sabe sobre este usuário de conversas anteriores]\n${aiMemory}`
      : "";
    const systemPrompt = AGENT_PROMPTS[agentType] + patrimonioCtx + memoryBlock;

    // Build user message content (multimodal if image present)
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

    // ── CALL SPECIALIST AGENT ─────────────────────────────────
    const anthropicRes = await callAnthropic("claude-sonnet-4-6", systemPrompt, messages);

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

    // Deduct credits
    const newBalance = currentBalance - CREDITS_PER_MESSAGE;
    await supabase
      .from("profiles")
      .update({ credit_balance: newBalance })
      .eq("id", userId);

    // Save to history
    await supabase.from("chat_messages").insert([
      {
        user_id: userId,
        role: "user",
        content: typeof message === "string" ? message : "[imagem/arquivo]",
      },
      { user_id: userId, role: "assistant", content: reply },
    ]);

    return new Response(
      JSON.stringify({ reply, agent: agentType, credit_balance: newBalance }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
