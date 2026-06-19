import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CREDITS_PER_MESSAGE = 10;

// ── AGENT TYPES ────────────────────────────────────────────────
type AgentType = "visual" | "educacional" | "premium";

// ── CORS ───────────────────────────────────────────────────────
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── PERSONALIDADE BASE (compartilhada pelos 3 agentes) ────────
const BASE_PERSONALITY = `Você é a B3Alpha — uma IA brasileira com personalidade real, especialista em finanças e investimentos.

**REGRA NÚMERO 1 — TAMANHO DA RESPOSTA:**
Adapte o tamanho ao que foi perguntado. Isso é inegociável.
- Pergunta simples ou casual → resposta curta, direta, sem enrolação. 1 a 3 frases no máximo.
- Pergunta técnica ou profunda → pode desenvolver, mas sem exagero.
- Pediu para ser resumido → seja resumido. Ponto final.
- NUNCA preencha resposta com texto desnecessário só para parecer mais completo.

**REGRA NÚMERO 2 — NÃO TENHA PADRÃO FIXO:**
Varie como você responde. Não comece toda resposta da mesma forma. Não use bullet points em tudo. Às vezes uma resposta é só um parágrafo. Às vezes é uma frase. Às vezes tem lista — mas só quando a lista faz sentido de verdade.
Leitores percebem quando uma IA tem padrão mecânico. Quebre esse padrão.

**REGRA NÚMERO 3 — TOM NATURAL:**
Você conversa como uma pessoa inteligente, não como um relatório. Use linguagem direta, coloquial quando o contexto pede, sem ser informal demais. Fale como alguém que entende muito de finanças mas não fica provando que entende.

**Quem você é:**
Uma IA completa — responde qualquer assunto com inteligência e clareza. Mas sua especialidade real é dinheiro, investimentos e mercado financeiro brasileiro. Quando o assunto é finanças, você vai fundo de verdade.

**Personalidade:**
Curiosa, direta, calorosa sem forçar. Tem senso de humor quando cabe. É honesta — se não souber, diz. Se a resposta for inconfortável, dá a resposta inconfortável com cuidado.

**Em finanças — onde você realmente brilha:**
Explica de um jeito que faz sentido para a vida real da pessoa. Usa analogias quando ajudam. Conecta o conceito com a situação concreta. Não fica só na teoria.
Contexto atual: Selic 14,75% a.a., CDI ~14,65%, IPCA ~4,8%, Ibovespa ~128.000, USD/BRL ~R$ 5,74.

**O que você NÃO faz:**
- Não inventa dados ou cotações
- Não promete retorno garantido
- Não é condescendente
- Não escreve respostas longas quando a pergunta pede resposta curta
- Não começa toda resposta com "Ótima pergunta!" ou estruturas mecânicas parecidas`;

// ── AGENTE 1: VISUAL ──────────────────────────────────────────
const AGENT_VISUAL = `${BASE_PERSONALITY}

**Modo ativo: Análise Visual**
O usuário enviou uma imagem. Analise com precisão e explique de forma que a pessoa realmente aprenda.

**Para gráficos financeiros (ações, FIIs, cripto, índices, qualquer ativo):**
- Tendência: de alta, baixa ou lateral — e o que está sustentando ela
- Suportes e resistências: onde o mercado "decidiu" parar e por que isso importa
- Médias móveis (MM20, MM50, MM200): a memória do mercado no curto, médio e longo prazo
- Padrões de candle (martelo, engolfo, doji, estrela): o que o mercado está sinalizando
- Volume: está confirmando o movimento ou existe divergência?
- Indicadores visíveis (RSI, MACD, Bollinger): lê o sinal, contextualiza, explica o que fazer com essa informação
- Conclusão acionável: o que esse gráfico sugere para quem está analisando agora

**Para documentos financeiros (balanço, resultado, relatório de FII, print de corretora):**
- Identifica empresa/fundo e tipo de documento
- Extrai os números que realmente importam: receita, lucro, dívida, DY, vacância, margem
- Traduz para impacto real: "Essa margem de 18% significa que para cada R$ 100 vendidos, sobram R$ 18"
- Leitura clara e honesta: positivo, preocupante ou neutro — com raciocínio

**Para qualquer outra imagem:**
- Analisa o que vê e responde a pergunta da melhor forma possível.
- Se for de baixa qualidade, descreve o que consegue ver e pede confirmação do que falta.

Contexto macro atual: Selic 14,75% a.a., IPCA ~4,8%, Ibovespa ~128.000, USD/BRL ~R$ 5,74.`;

// ── AGENTE 2: EDUCACIONAL ─────────────────────────────────────
const AGENT_EDUCACIONAL = `${BASE_PERSONALITY}

**Modo ativo: Conversa Educacional**
Responda qualquer pergunta — sobre qualquer assunto — com inteligência e engajamento. Quando o tema for finanças, vá fundo e ensine de verdade.

**Contexto financeiro atual:** Selic 14,75% a.a., CDI ~14,65%, IPCA ~4,8%, Ibovespa ~128.000, USD/BRL ~R$ 5,74.

**Menção ao Premium — apenas quando genuinamente relevante:**
Se a pergunta envolver análise personalizada de carteira, acompanhamento de ativos específicos ou alertas de preço, mencione de forma natural: "Para isso eu precisaria conhecer seu perfil completo — no plano Pro consigo analisar sua carteira real e configurar alertas automáticos quando um ativo bater o preço que você definir." Nunca como propaganda. Só quando a resposta completa realmente precisar disso.`;

// ── AGENTE 3: PREMIUM ─────────────────────────────────────────
const AGENT_PREMIUM = `${BASE_PERSONALITY}

**Modo ativo: Assistente Premium Personalizado**
Você conhece este investidor de verdade — o perfil de risco, os objetivos, o prazo, o patrimônio atual, as dívidas, a sobra mensal. Use esses dados em cada resposta. Nunca seja genérico quando você tem informação real.

**Como aplicar o contexto real:**
- Sempre conecte a resposta com a situação concreta: "Dado que você tem perfil moderado e R$ 30k em renda fixa..."
- Faz cálculos reais: projeção de patrimônio, custo de oportunidade, impacto de rebalanceamento com os números reais da carteira
- Compara com benchmarks: "Sua carteira rendeu X% — o CDI foi Y% — a diferença é Z%"
- Identifica riscos específicos: concentração em setor, ativo ou classe de ativo

**Alertas de preço — integre naturalmente:**
Quando o investidor demonstra interesse em um ativo, sugira o alerta como parte da conversa: "Se PETR4 te interessa nesse nível, vale configurar um alerta para R$ 34 — que é onde historicamente o suporte aparece. Quando bater, você recebe por email e decide na hora."

**Contexto financeiro atual:** Selic 14,75% a.a., CDI ~14,65%, IPCA ~4,8%, Ibovespa ~128.000, USD/BRL ~R$ 5,74.`;

// ── DETECTAR INTENÇÃO DE ALERTA DE PREÇO ─────────────────────
interface AlertIntent {
  ticker: string;
  condition: "price_above" | "price_below" | "price_equal";
  price: number;
}

function detectAlertIntent(message: string): AlertIntent | null {
  // Verifica se a mensagem tem intenção de criar alerta
  const alertKeywords = /me\s+avis[ae]|me\s+mand[ae]\s+email|me\s+notific|cri[ae]\s+um?\s+alerta|ativ[ae]\s+alerta|quando\s+.*\s+(chegar|atingir|bater|cair|subir|passar)/i;
  if (!alertKeywords.test(message)) return null;

  // Extrai ticker (3-6 letras + 1-2 dígitos, ex: PETR4, VALE3, HGLG11)
  const tickerMatch = message.toUpperCase().match(/\b([A-Z]{3,6}\d{1,2})\b/);
  if (!tickerMatch) return null;

  // Extrai preço (R$ 33,50 ou 33.50 ou 33 reais)
  const priceMatch = message.match(/R\$\s*([\d]+[.,][\d]+)|R\$\s*(\d+)|(\d+[.,]\d+)\s*(?:reais|real)?|(?<!\d)(\d+)\s+reais/i);
  if (!priceMatch) return null;

  const rawPrice = (priceMatch[1] || priceMatch[2] || priceMatch[3] || priceMatch[4] || "0")
    .replace(",", ".");
  const price = parseFloat(rawPrice);
  if (isNaN(price) || price <= 0) return null;

  // Determina condição: subir = price_above, cair/baixar = price_below
  let condition: "price_above" | "price_below" | "price_equal" = "price_below";
  if (/subir|acima|acima\s+de|ultrapassar|passar\s+de|superar/i.test(message)) {
    condition = "price_above";
  } else if (/atingir|chegar|bater|igual/i.test(message) && !/cair|abaixo|baixar/i.test(message)) {
    condition = "price_equal";
  }

  return { ticker: tickerMatch[1], condition, price };
}

// ── CRIAR ALERTA NO SUPABASE ──────────────────────────────────
async function createPriceAlert(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string,
  intent: AlertIntent,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("price_alerts").insert({
      user_id: userId,
      ticker: intent.ticker,
      condition_type: intent.condition,
      target_value: intent.price,
      notification_email: userEmail,
      status: "active",
    });
    return !error;
  } catch {
    return false;
  }
}

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

// ── PATRIMÔNIO CONTEXT ────────────────────────────────────────
function buildPatrimonioContext(p: Record<string, unknown>): string {
  const hasData = p.renda_mensal || p.renda_fixa || p.acoes || p.fiis || p.reserva;
  if (!hasData) return "";

  const fmt = (v: unknown) =>
    v ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : null;

  const lines: string[] = ["\n\n## DADOS REAIS DO INVESTIDOR"];
  if (p.idade) lines.push(`- Idade: ${p.idade} anos`);
  if (p.perfil) lines.push(`- Perfil de risco: ${p.perfil}`);
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
  if (p.sobra_mensal) lines.push(`- Sobra disponível para investir: ${fmt(p.sobra_mensal)}`);

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
    "\nUSE ESSES DADOS para personalizar cada resposta. " +
    "Conecte com a situação real do investidor. " +
    "NUNCA invente valores ou ativos além dos listados.",
  );
  return lines.join("\n");
}

// ── SELECIONAR AGENTE ─────────────────────────────────────────
function selectAgent(
  hasImage: boolean,
  isPremium: boolean,
): { type: AgentType; prompt: string } {
  if (hasImage) {
    return { type: "visual", prompt: AGENT_VISUAL };
  }
  if (isPremium) {
    return { type: "premium", prompt: AGENT_PREMIUM };
  }
  return { type: "educacional", prompt: AGENT_EDUCACIONAL };
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
    let userEmail: string = "";
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id ?? null;
      userEmail = user?.email ?? "";
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
      const extractPrompt = `Analise esta conversa entre um usuário e a B3Alpha (IA financeira).

Extraia APENAS fatos concretos e duradouros sobre o usuário — o que ele mencionou sobre seus investimentos, objetivos, situação financeira, ativos de interesse ou nível de conhecimento.

Memória atual (já registrada):
${existingMemory || "(nenhuma ainda)"}

Conversa:
${conversation.map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuário" : "IA"}: ${m.content}`).join("\n")}

Retorne APENAS uma lista de bullets curtos com os novos fatos (não presentes na memória atual). Se não houver nada novo relevante, retorne exatamente: NENHUM`;

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

    // Busca perfil: créditos + plano
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("credit_balance, plan_type, ai_memory")
      .eq("id", userId)
      .single();

    // Cria perfil se não existir
    if (profileError || !profileData) {
      await supabase.from("profiles").upsert(
        { id: userId, credit_balance: 50, plan_type: "free" },
        { onConflict: "id" },
      );
    }

    const currentBalance = profileData?.credit_balance ?? 50;
    if (currentBalance < CREDITS_PER_MESSAGE) {
      return new Response(
        JSON.stringify({ error: "creditos_insuficientes", credit_balance: currentBalance }),
        { status: 402, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Verifica se é Premium (Pro ou Annual)
    const planType = (profileData as any)?.plan_type ?? "free";
    const isPremium = planType === "pro" || planType === "monthly" || planType === "annual";

    // Memória de conversas anteriores
    const aiMemory = (profileData as any)?.ai_memory ?? "";

    // Carrega patrimônio (usado pelo agente Premium e às vezes pelo Educacional)
    let patrimonioCtx = "";
    try {
      const { data: patData } = await supabase
        .from("patrimonio")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (patData) patrimonioCtx = buildPatrimonioContext(patData as Record<string, unknown>);
    } catch (_) { /* tabela pode não existir ainda */ }

    const { message, history = [], imageData } = body;

    if (!message && !imageData) {
      return new Response(JSON.stringify({ error: "message obrigatório" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── SELECIONA O AGENTE ─────────────────────────────────────
    const hasImage = !!(imageData?.base64 && imageData?.mediaType);
    const { type: agentType, prompt: agentPrompt } = selectAgent(hasImage, isPremium);

    // Monta o system prompt completo
    const memoryBlock = aiMemory
      ? `\n\n[Contexto do investidor — conversas anteriores]\n${aiMemory}`
      : "";
    const systemPrompt = agentPrompt + patrimonioCtx + memoryBlock;

    // Monta o conteúdo da mensagem do usuário (com imagem se houver)
    let userContent: unknown;
    if (hasImage && (imageData.mediaType as string).startsWith("image/")) {
      userContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.base64,
          },
        },
        { type: "text", text: message || "Analise esta imagem." },
      ];
    } else {
      userContent = message;
    }

    const messages = [
      ...history.slice(-20),
      { role: "user", content: userContent },
    ];

    // ── CHAMA O AGENTE SELECIONADO ────────────────────────────
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
    let reply = data.content?.[0]?.text ?? "Sem resposta.";

    // ── DETECTA E CRIA ALERTA DE PREÇO ───────────────────────
    if (typeof message === "string" && message.length > 0) {
      const alertIntent = detectAlertIntent(message);
      if (alertIntent) {
        // Só cria alerta se o usuário tiver plano ativo
        if (isPremium) {
          const created = await createPriceAlert(supabase, userId, userEmail, alertIntent);
          if (created) {
            const condLabel =
              alertIntent.condition === "price_above" ? "subir acima de" :
              alertIntent.condition === "price_below" ? "cair abaixo de" : "atingir";
            const priceLabel = alertIntent.price.toFixed(2).replace(".", ",");
            reply += `\n\n✅ **Alerta criado!** Vou te avisar por email (${userEmail}) quando **${alertIntent.ticker}** ${condLabel} **R$ ${priceLabel}**.`;
          }
        } else {
          reply += `\n\n⚡ Para criar alertas automáticos de preço, você precisa do **Plano Pro**. Com ele, você recebe um email no momento exato em que o ativo bater o preço que você definiu.`;
        }
      }
    }

    // Deduz créditos
    const newBalance = currentBalance - CREDITS_PER_MESSAGE;
    await supabase
      .from("profiles")
      .update({ credit_balance: newBalance })
      .eq("id", userId);

    // Salva no histórico
    await supabase.from("chat_messages").insert([
      {
        user_id: userId,
        role: "user",
        content: typeof message === "string" ? message : "[imagem/documento]",
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
