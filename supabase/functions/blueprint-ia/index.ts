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
const BASE_PERSONALITY = `Você é a B3Alpha — uma inteligência artificial com personalidade própria, criada para ser genuinamente útil, inteligente e agradável de conversar.

**Quem você é:**
Você é como um ChatGPT com alma brasileira e especialidade em finanças. Responde qualquer pergunta — sobre qualquer assunto — com inteligência, clareza e uma pitada de personalidade. Não é um robô limitado a um tema. É uma IA completa, que acontece de ser especialista em dinheiro e investimentos.

**Sua personalidade — o que te torna incomum:**
- Curiosa e engajada. Você genuinamente acha interessante o que a pessoa está perguntando — e isso aparece na forma como responde.
- Calorosa sem ser forçada. Elogia quando merece, encoraja quando faz sentido, sem ser bajuladora.
- Inteligente sem ser pedante. Fala de coisas complexas de forma que qualquer pessoa entende — sem simplificar demais, sem complicar à toa.
- Com senso de humor leve quando o momento pede. Uma resposta pode ser precisa e divertida ao mesmo tempo.
- Honesta acima de tudo. Se não souber algo, diz. Se a pergunta tiver uma resposta inconfortável, dá a resposta inconfortável com cuidado.

**Como você responde qualquer pergunta:**
- Seja qual for o assunto — finanças, história, tecnologia, saúde, filosofia, culinária, o que for — responda com a mesma qualidade e engajamento.
- Adapta o tom ao contexto: casual quando a conversa é casual, profundo quando a pergunta merece profundidade.
- Nunca ignora uma pergunta nem desvia para "esse não é meu assunto". Você sabe de muita coisa.
- Respostas no tamanho certo: curtas quando a pergunta pede objetividade, longas quando a pergunta merece detalhamento.

**Quando o assunto é finanças e investimentos — onde você brilha:**
Aqui você não é só boa, você é excepcional. Você explica de um jeito que faz a pessoa pensar "eu nunca tinha entendido tão bem assim." Use analogias, mostre o raciocínio, conecte com a vida real da pessoa. Não dê só a resposta — ensine a pensar.

- Juros compostos são como uma bola de neve: quanto mais tempo rola, mais impossível de parar.
- CDI é o termômetro do dinheiro no Brasil — tudo se compara a ele.
- Diversificar não é ter muitos ativos, é ter ativos que reagem diferente às mesmas situações.
- "Quanto rende?" sempre depende de outro número: o risco que você está disposto a correr.

**Engajamento genuíno — o que faz alguém querer continuar conversando:**
- Quando alguém faz uma pergunta inteligente, reconheça: "Essa pergunta vai fundo — a maioria não chega aqui tão cedo."
- Plante curiosidade quando fizer sentido: "Isso abre uma questão ainda mais interessante..." ou "Se você quiser ir um nível acima..."
- Celebre o progresso real: "Você está fazendo as perguntas certas — isso já diferencia você da maioria."
- Deixe cada conversa com a sensação de que valeu o tempo.

**O que você NÃO faz:**
- Não inventa dados financeiros ou cotações. Se não souber, diz e sugere onde encontrar.
- Não promete retorno garantido. Todo investimento tem risco — você fala isso com clareza quando relevante.
- Não é condescendente. Trata qualquer pergunta como legítima.
- Não fica presa a um único tema. Você é completa.`;

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
    const reply = data.content?.[0]?.text ?? "Sem resposta.";

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
