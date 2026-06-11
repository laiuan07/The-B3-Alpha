import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY  = Deno.env.get("ANTHROPIC_API_KEY")  ?? "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")        ?? "";
const SUPABASE_SERVICE_KEY= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BRAPI_TOKEN         = Deno.env.get("BRAPI_TOKEN")         ?? "";
const BRAVE_API_KEY       = Deno.env.get("BRAVE_API_KEY")       ?? "";

const CREDITS_PER_MESSAGE = 10;

// ── CORS ───────────────────────────────────────────────────────
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ══════════════════════════════════════════════════════════════
// FERRAMENTAS (tools) — Brapi + Brave
// ══════════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: "buscar_cotacao",
    description:
      "Busca cotação em tempo real de ativos da B3 via Brapi.dev. " +
      "Use para obter preço atual, variação, volume, P/L, P/VP, Dividend Yield e outros indicadores. " +
      "Aceita múltiplos tickers separados por vírgula: 'VALE3,PETR4,HGLG11'. " +
      "Use sempre que o usuário perguntar sobre preço, variação ou indicadores de qualquer ativo.",
    input_schema: {
      type: "object",
      properties: {
        tickers: {
          type: "string",
          description: "Um ou mais tickers separados por vírgula. Ex: 'VALE3' ou 'VALE3,PETR4'",
        },
        incluir_dividendos: {
          type: "boolean",
          description: "Se true, inclui histórico de dividendos recentes. Padrão: false.",
        },
      },
      required: ["tickers"],
    },
  },
  {
    name: "buscar_noticias",
    description:
      "Busca notícias financeiras reais e verificáveis na web em tempo real. " +
      "USE DE FORMA PROATIVA — não apenas quando pedido, mas sempre que a análise depender de contexto atual. " +
      "ACIONE OBRIGATORIAMENTE para: " +
      "(1) qualquer pergunta sobre Selic, Copom, IPCA, câmbio, política monetária — busque a decisão mais recente; " +
      "(2) análise de qualquer ação específica — busque fatos relevantes, resultados, guidance recente; " +
      "(3) qualquer pergunta sobre FIIs — busque cenário de juros e dividendos recentes; " +
      "(4) perguntas sobre o mercado brasileiro em geral — Ibovespa, fluxo estrangeiro, humor do mercado; " +
      "(5) criptomoedas — preço atual, regulação no Brasil, movimentos institucionais; " +
      "(6) qualquer pergunta com as palavras agora, hoje, essa semana, esse mês, recente, atual, 2025 ou 2026; " +
      "(7) análise de carteira com ativos específicos mencionados — contextualize cada ativo. " +
      "Fontes priorizadas: Valor Econômico, InfoMoney, Bloomberg Brasil, Exame, B3, CVM, RI das empresas. " +
      "Após receber os resultados, integre-os naturalmente — nunca mencione que fez uma busca.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Termo de busca preciso e atual. " +
            "Exemplos: 'Copom Selic decisao junho 2025', 'VALE3 resultado trimestral 2025', " +
            "'Ibovespa hoje', 'IPCA maio 2025', 'Bitcoin preco hoje', 'FIIs dividendos 2025', " +
            "'Petrobras fato relevante 2025', 'dolar real hoje', 'inflacao Brasil 2025'",
        },
        profundidade: {
          type: "string",
          enum: ["rapida", "completa"],
          description:
            "rapida: 3 resultados para contexto simples. " +
            "completa: 8 resultados para análise aprofundada de macro ou empresa. " +
            "Padrão: rapida.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "calcular_financeiro",
    description:
      "Executa cálculos financeiros com precisão matemática via código. " +
      "USE SEMPRE que o usuário pedir qualquer cálculo numérico financeiro. " +
      "NUNCA faça estimativas mentais — sempre chame esta ferramenta para garantir resultado exato. " +
      "Tipos disponíveis: " +
      "juros_compostos (projeção de patrimônio com aportes mensais), " +
      "preco_justo_graham (valor intrínseco pela fórmula de Graham), " +
      "preco_justo_bazin (preço máximo pelo critério de Bazin), " +
      "dividend_yield (DY atual e comparação com CDI), " +
      "yield_on_cost (rendimento sobre o custo de aquisição), " +
      "retorno_real (retorno descontando inflação), " +
      "equivalencia_cdb_lci (comparação entre CDB tributado e LCI isento), " +
      "patrimonio_para_renda (capital necessário para gerar renda passiva), " +
      "custo_oportunidade (comparação entre dois investimentos), " +
      "simulacao_carteira (projeção de carteira diversificada com múltiplos ativos), " +
      "ir_ganho_capital (imposto de renda sobre operação), " +
      "prazo_dobrar (tempo para dobrar o capital em determinada taxa).",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: [
            "juros_compostos",
            "preco_justo_graham",
            "preco_justo_bazin",
            "dividend_yield",
            "yield_on_cost",
            "retorno_real",
            "equivalencia_cdb_lci",
            "patrimonio_para_renda",
            "custo_oportunidade",
            "simulacao_carteira",
            "ir_ganho_capital",
            "prazo_dobrar",
          ],
          description: "Tipo de cálculo a executar.",
        },
        params: {
          type: "object",
          description:
            "Parâmetros do cálculo conforme o tipo. " +
            "juros_compostos: { capital_inicial, aporte_mensal, taxa_anual, anos, inflacao_anual? } " +
            "preco_justo_graham: { lpa, vpa } " +
            "preco_justo_bazin: { dividendo_anual_por_acao } " +
            "dividend_yield: { dividendo_anual, preco_atual, cdi_atual? } " +
            "yield_on_cost: { dividendo_atual_por_acao, preco_compra } " +
            "retorno_real: { retorno_nominal, inflacao } " +
            "equivalencia_cdb_lci: { taxa_cdb, aliquota_ir } " +
            "patrimonio_para_renda: { renda_mensal_desejada, dy_anual_esperado } " +
            "custo_oportunidade: { valor, taxa_a, nome_a, taxa_b, nome_b, anos } " +
            "simulacao_carteira: { ativos: [{nome, percentual, taxa_anual}], capital_total, aporte_mensal, anos } " +
            "ir_ganho_capital: { preco_compra, preco_venda, quantidade, tipo_operacao, total_vendas_mes? } " +
            "prazo_dobrar: { taxa_anual }",
        },
      },
      required: ["tipo", "params"],
    },
  },
];

// ══════════════════════════════════════════════════════════════
// EXECUÇÃO DAS FERRAMENTAS
// ══════════════════════════════════════════════════════════════

async function executarBuscarCotacao(
  tickers: string,
  incluirDividendos = false,
): Promise<string> {
  try {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(tickers)}` +
      `?token=${BRAPI_TOKEN}&fundamental=true&dividends=${incluirDividendos}`;

    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();

    if (!data.results?.length) {
      return JSON.stringify({ erro: `Nenhum dado encontrado para ${tickers}` });
    }

    const ativos = data.results.map((r: Record<string, unknown>) => ({
      ticker:         r.symbol,
      nome:           r.shortName ?? r.longName,
      preco_atual:    r.regularMarketPrice,
      variacao_dia:   r.regularMarketChange,
      variacao_pct:   r.regularMarketChangePercent,
      abertura:       r.regularMarketOpen,
      minimo_dia:     r.regularMarketDayLow,
      maximo_dia:     r.regularMarketDayHigh,
      volume:         r.regularMarketVolume,
      market_cap:     r.marketCap,
      pl:             r.priceEarningsRatio,
      pvp:            r.priceToBook,
      dividend_yield: r.dividendYield,
      roe:            r.returnOnEquity,
      min_52s:        r.fiftyTwoWeekLow,
      max_52s:        r.fiftyTwoWeekHigh,
      ...(incluirDividendos && r.dividendsData
        ? { dividendos_recentes: (r.dividendsData as Record<string, unknown[]>).cashDividends?.slice(0, 5) }
        : {}),
    }));

    return JSON.stringify({
      fonte: "Brapi.dev — B3 dados ao vivo",
      horario: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      ativos,
    });
  } catch (e) {
    return JSON.stringify({ erro: `Falha ao buscar cotação: ${String(e)}` });
  }
}

async function executarBuscarNoticias(
  query: string,
  profundidade: string = "rapida",
): Promise<string> {
  try {
    // Fontes financeiras brasileiras prioritárias + fontes globais de referência
    const fontesBR =
      "site:valoreconomico.com.br OR site:infomoney.com.br OR " +
      "site:bloomberg.com.br OR site:exame.com OR site:b3.com.br OR " +
      "site:moneytimes.com.br OR site:investing.com.br OR site:suno.com.br OR " +
      "site:estadao.com.br OR site:folha.uol.com.br OR site:cvm.gov.br";

    const count   = profundidade === "completa" ? "8" : "4";
    const freshness = "pm"; // último mês — garante atualidade

    const params = new URLSearchParams({
      q:                `${query} (${fontesBR})`,
      count,
      search_lang:      "pt",
      country:          "BR",
      text_decorations: "false",
      freshness,
    });

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          "Accept":               "application/json",
          "Accept-Encoding":      "gzip",
          "X-Subscription-Token": BRAVE_API_KEY,
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      return JSON.stringify({ erro: `Brave retornou status ${res.status}` });
    }

    const data = await res.json();
    const resultados = (data.web?.results ?? [])
      .slice(0, parseInt(count))
      .map((item: Record<string, string>) => ({
        titulo:  item.title   ?? "",
        url:     item.url     ?? "",
        resumo:  item.description ?? "",
        data:    item.page_age    ?? "",
        fonte:   new URL(item.url ?? "https://x.com").hostname.replace("www.", ""),
      }))
      .filter((r: Record<string, string>) => r.titulo && r.resumo);

    if (!resultados.length) {
      // Fallback: busca sem restrição de domínio
      const fallbackParams = new URLSearchParams({
        q:                `${query} investimentos Brasil`,
        count:            "4",
        search_lang:      "pt",
        text_decorations: "false",
      });
      const fallbackRes  = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${fallbackParams}`,
        {
          headers: {
            "Accept":               "application/json",
            "Accept-Encoding":      "gzip",
            "X-Subscription-Token": BRAVE_API_KEY,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const fallbackResults = (fallbackData.web?.results ?? []).slice(0, 4).map(
          (item: Record<string, string>) => ({
            titulo: item.title ?? "",
            url:    item.url   ?? "",
            resumo: item.description ?? "",
            data:   item.page_age ?? "",
          }),
        );
        if (fallbackResults.length) {
          return JSON.stringify({
            fonte:      "Busca geral — dados de contexto",
            query,
            resultados: fallbackResults,
          });
        }
      }
      return JSON.stringify({ aviso: "Nenhuma notícia encontrada para este contexto." });
    }

    return JSON.stringify({
      fonte:       "Brave Search — fontes financeiras verificadas",
      query,
      profundidade,
      total:       resultados.length,
      resultados,
    });
  } catch (e) {
    return JSON.stringify({ erro: `Falha na busca de noticias: ${String(e)}` });
  }
}


// ══════════════════════════════════════════════════════════════
// CALCULADORA FINANCEIRA — código executa, não estima
// Precisão matemática real. Nunca usa aproximação mental.
// ══════════════════════════════════════════════════════════════

function executarCalcularFinanceiro(
  tipo: string,
  params: Record<string, unknown>,
): string {
  const fmt = (v: number, decimais = 2) =>
    "R$ " + v.toLocaleString("pt-BR", {
      minimumFractionDigits: decimais,
      maximumFractionDigits: decimais,
    });
  const pct = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

  try {
    switch (tipo) {

      // ── JUROS COMPOSTOS COM APORTES MENSAIS ──────────────────
      case "juros_compostos": {
        const P   = Number(params.capital_inicial   ?? 0);
        const pmt = Number(params.aporte_mensal      ?? 0);
        const ia  = Number(params.taxa_anual         ?? 0) / 100;
        const n   = Number(params.anos               ?? 0);
        const inf = Number(params.inflacao_anual     ?? 4.5) / 100;

        const im = Math.pow(1 + ia, 1 / 12) - 1; // taxa mensal equivalente
        const meses = n * 12;

        // Montante = capital × (1+im)^n + PMT × [(1+im)^n - 1] / im
        const montante = P * Math.pow(1 + im, meses) +
          (im > 0 ? pmt * (Math.pow(1 + im, meses) - 1) / im : pmt * meses);

        const totalAportado = P + pmt * meses;
        const rendimento    = montante - totalAportado;

        // Retorno real descontando inflação
        const taxaRealAnual = ((1 + ia) / (1 + inf) - 1) * 100;
        const imReal        = Math.pow(1 + taxaRealAnual / 100, 1 / 12) - 1;
        const montanteReal  = P * Math.pow(1 + imReal, meses) +
          (imReal > 0 ? pmt * (Math.pow(1 + imReal, meses) - 1) / imReal : pmt * meses);

        // Evolução por período
        const marcos: Record<string, string> = {};
        [1, 2, 3, 5, 10, 15, 20, 25, 30].filter(a => a <= n).forEach(a => {
          const m2  = a * 12;
          const val = P * Math.pow(1 + im, m2) +
            (im > 0 ? pmt * (Math.pow(1 + im, m2) - 1) / im : pmt * m2);
          marcos[`${a} anos`] = fmt(val);
        });

        return JSON.stringify({
          tipo: "Juros Compostos com Aportes Mensais",
          parametros: {
            capital_inicial: fmt(P),
            aporte_mensal: fmt(pmt),
            taxa_anual: pct(ia * 100),
            taxa_mensal_equivalente: pct(im * 100),
            prazo: `${n} anos (${meses} meses)`,
          },
          resultado: {
            montante_final_nominal: fmt(montante),
            total_aportado: fmt(totalAportado),
            rendimento_total: fmt(rendimento),
            rentabilidade_total: pct((montante / totalAportado - 1) * 100),
            montante_real_poder_compra: fmt(montanteReal),
            taxa_real_anual: pct(taxaRealAnual),
          },
          evolucao: marcos,
          nota: "Cálculo matemático exato. Taxa mensal equivalente calculada via raiz 12 da taxa anual.",
        });
      }

      // ── PREÇO JUSTO — GRAHAM ─────────────────────────────────
      case "preco_justo_graham": {
        const lpa = Number(params.lpa ?? 0);
        const vpa = Number(params.vpa ?? 0);
        if (lpa <= 0 || vpa <= 0) {
          return JSON.stringify({ erro: "LPA e VPA precisam ser positivos para aplicar Graham." });
        }
        const preco = Math.sqrt(22.5 * lpa * vpa);
        const margemSeguranca = preco * 0.75;
        return JSON.stringify({
          tipo: "Preço Justo — Fórmula de Graham",
          parametros: { lpa: fmt(lpa), vpa: fmt(vpa) },
          resultado: {
            preco_justo_graham: fmt(preco),
            preco_com_margem_seguranca_25pct: fmt(margemSeguranca),
            interpretacao: preco > 0
              ? `Comprar abaixo de ${fmt(margemSeguranca)} para margem de segurança de 25%. Pagar até ${fmt(preco)} ainda é razoável.`
              : "Dados insuficientes para calcular.",
          },
          nota: "Fórmula: √(22,5 × LPA × VPA). Margem de segurança recomendada: 25% abaixo do preço justo.",
        });
      }

      // ── PREÇO JUSTO — BAZIN ──────────────────────────────────
      case "preco_justo_bazin": {
        const div = Number(params.dividendo_anual_por_acao ?? 0);
        if (div <= 0) return JSON.stringify({ erro: "Informe o dividendo anual por ação." });
        const preco = div / 0.06;
        return JSON.stringify({
          tipo: "Preço Máximo — Critério de Bazin",
          parametros: { dividendo_anual_por_acao: fmt(div) },
          resultado: {
            preco_maximo_bazin: fmt(preco),
            dy_minimo_criterio: "6% ao ano",
            interpretacao: `Pagar no máximo ${fmt(preco)} para garantir DY mínimo de 6% ao ano. Acima desse preço, o ativo não atende ao critério de Bazin.`,
          },
          nota: "Fórmula: Dividendo anual ÷ 0,06. Desenvolvida por Décio Bazin para identificar ações pagadoras a preço justo.",
        });
      }

      // ── DIVIDEND YIELD ───────────────────────────────────────
      case "dividend_yield": {
        const div   = Number(params.dividendo_anual  ?? 0);
        const preco = Number(params.preco_atual      ?? 0);
        const cdi   = Number(params.cdi_atual        ?? 14.65);
        if (preco <= 0) return JSON.stringify({ erro: "Informe o preço atual do ativo." });
        const dy    = (div / preco) * 100;
        const spread = dy - cdi;
        return JSON.stringify({
          tipo: "Dividend Yield",
          parametros: { dividendo_anual: fmt(div), preco_atual: fmt(preco), cdi_referencia: pct(cdi) },
          resultado: {
            dividend_yield: pct(dy),
            spread_sobre_cdi: `${spread >= 0 ? "+" : ""}${pct(spread)}`,
            avaliacao: dy >= cdi + 2
              ? "DY atrativo — supera o CDI com folga. Justifica o risco de renda variável."
              : dy >= cdi
              ? "DY razoável — supera o CDI, mas a margem é pequena. Avaliar crescimento e segurança do dividendo."
              : "DY abaixo do CDI — para compensar, o ativo precisa oferecer crescimento ou valorização acima da diferença.",
          },
        });
      }

      // ── YIELD ON COST ────────────────────────────────────────
      case "yield_on_cost": {
        const divAtual = Number(params.dividendo_atual_por_acao ?? 0);
        const precoCompra = Number(params.preco_compra ?? 0);
        if (precoCompra <= 0) return JSON.stringify({ erro: "Informe o preço de compra." });
        const yoc = (divAtual / precoCompra) * 100;
        return JSON.stringify({
          tipo: "Yield on Cost (YOC)",
          parametros: { dividendo_atual: fmt(divAtual), preco_compra_original: fmt(precoCompra) },
          resultado: {
            yield_on_cost: pct(yoc),
            interpretacao: `Você está recebendo ${pct(yoc)} ao ano sobre o capital que investiu originalmente. Independente do preço atual do ativo.`,
          },
          nota: "YOC mede o rendimento real sobre o custo histórico de aquisição — não sobre o preço atual.",
        });
      }

      // ── RETORNO REAL ─────────────────────────────────────────
      case "retorno_real": {
        const nominal  = Number(params.retorno_nominal ?? 0);
        const inflacao = Number(params.inflacao       ?? 0);
        const real     = ((1 + nominal / 100) / (1 + inflacao / 100) - 1) * 100;
        return JSON.stringify({
          tipo: "Retorno Real (descontando inflação)",
          parametros: { retorno_nominal: pct(nominal), inflacao: pct(inflacao) },
          resultado: {
            retorno_real: pct(real),
            interpretacao: real > 0
              ? `Seu dinheiro cresceu ${pct(real)} acima da inflação. Você ganhou poder de compra real.`
              : `Seu dinheiro PERDEU ${pct(Math.abs(real))} de poder de compra. O investimento não protegeu contra a inflação.`,
          },
          nota: "Fórmula: ((1 + nominal) ÷ (1 + inflação)) − 1. Não é simples subtração.",
        });
      }

      // ── EQUIVALÊNCIA CDB vs LCI ──────────────────────────────
      case "equivalencia_cdb_lci": {
        const taxaCdb = Number(params.taxa_cdb    ?? 0);
        const ir      = Number(params.aliquota_ir ?? 15) / 100;
        const lciEquiv = taxaCdb * (1 - ir);
        return JSON.stringify({
          tipo: "Equivalência CDB (tributado) vs LCI/LCA (isento)",
          parametros: { taxa_cdb: pct(taxaCdb), aliquota_ir: pct(ir * 100) },
          resultado: {
            taxa_liquida_cdb: pct(taxaCdb * (1 - ir)),
            lci_equivalente_minimo: pct(lciEquiv),
            interpretacao: `Uma LCI/LCA pagando acima de ${pct(lciEquiv)} é mais rentável que este CDB. Abaixo disso, o CDB vence mesmo sendo tributado.`,
          },
          nota: "Fórmula: taxa CDB × (1 − alíquota IR). Usar alíquota conforme prazo: 22,5% até 180d, 20% até 360d, 17,5% até 720d, 15% acima de 720d.",
        });
      }

      // ── PATRIMÔNIO PARA RENDA PASSIVA ────────────────────────
      case "patrimonio_para_renda": {
        const renda = Number(params.renda_mensal_desejada ?? 0);
        const dy    = Number(params.dy_anual_esperado     ?? 0) / 100;
        if (dy <= 0) return JSON.stringify({ erro: "Informe o DY anual esperado (%)." });
        const capital = (renda * 12) / dy;
        const rendaMensal = capital * dy / 12;
        return JSON.stringify({
          tipo: "Capital Necessário para Renda Passiva",
          parametros: { renda_mensal_desejada: fmt(renda), dy_anual_esperado: pct(dy * 100) },
          resultado: {
            capital_necessario: fmt(capital),
            renda_mensal_gerada: fmt(rendaMensal),
            renda_anual_gerada: fmt(rendaMensal * 12),
            interpretacao: `Para receber ${fmt(renda)} por mês com DY de ${pct(dy * 100)} ao ano, você precisa acumular ${fmt(capital)}.`,
          },
          nota: "Fórmula: (Renda mensal × 12) ÷ DY anual. Considere que o DY pode variar — planeje com margem de segurança.",
        });
      }

      // ── CUSTO DE OPORTUNIDADE ────────────────────────────────
      case "custo_oportunidade": {
        const valor = Number(params.valor  ?? 0);
        const taA   = Number(params.taxa_a ?? 0) / 100;
        const taB   = Number(params.taxa_b ?? 0) / 100;
        const nomeA = String(params.nome_a ?? "Investimento A");
        const nomeB = String(params.nome_b ?? "Investimento B");
        const anos  = Number(params.anos   ?? 1);

        const montanteA = valor * Math.pow(1 + taA, anos);
        const montanteB = valor * Math.pow(1 + taB, anos);
        const diferenca = Math.abs(montanteA - montanteB);
        const melhor    = montanteA >= montanteB ? nomeA : nomeB;

        return JSON.stringify({
          tipo: "Custo de Oportunidade",
          parametros: { valor: fmt(valor), prazo: `${anos} anos` },
          resultado: {
            [nomeA]: { taxa_anual: pct(taA * 100), montante_final: fmt(montanteA) },
            [nomeB]: { taxa_anual: pct(taB * 100), montante_final: fmt(montanteB) },
            diferenca_final: fmt(diferenca),
            melhor_opcao: melhor,
            interpretacao: `Escolher ${melhor} rende ${fmt(diferenca)} a mais em ${anos} anos sobre o mesmo capital inicial.`,
          },
        });
      }

      // ── SIMULAÇÃO DE CARTEIRA DIVERSIFICADA ──────────────────
      case "simulacao_carteira": {
        const ativos    = params.ativos as Array<{nome: string; percentual: number; taxa_anual: number}>;
        const capital   = Number(params.capital_total  ?? 0);
        const aporte    = Number(params.aporte_mensal  ?? 0);
        const anos      = Number(params.anos           ?? 0);
        const meses     = anos * 12;

        if (!ativos || !ativos.length) {
          return JSON.stringify({ erro: "Informe a lista de ativos com nome, percentual e taxa_anual." });
        }

        const resultadoAtivos = ativos.map(a => {
          const capitalAtivo = capital * (a.percentual / 100);
          const aporteAtivo  = aporte  * (a.percentual / 100);
          const im           = Math.pow(1 + a.taxa_anual / 100, 1 / 12) - 1;
          const montante      = capitalAtivo * Math.pow(1 + im, meses) +
            (im > 0 ? aporteAtivo * (Math.pow(1 + im, meses) - 1) / im : aporteAtivo * meses);
          return { nome: a.nome, percentual: pct(a.percentual), montante_final: fmt(montante), taxa_anual: pct(a.taxa_anual) };
        });

        // Taxa média ponderada
        const taxaMedia = ativos.reduce((acc, a) => acc + (a.percentual / 100) * a.taxa_anual, 0);
        const im        = Math.pow(1 + taxaMedia / 100, 1 / 12) - 1;
        const totalFinal = capital * Math.pow(1 + im, meses) +
          (im > 0 ? aporte * (Math.pow(1 + im, meses) - 1) / im : aporte * meses);

        return JSON.stringify({
          tipo: "Simulação de Carteira Diversificada",
          parametros: { capital_total: fmt(capital), aporte_mensal: fmt(aporte), prazo: `${anos} anos` },
          resultado_por_ativo: resultadoAtivos,
          resultado_consolidado: {
            taxa_media_ponderada: pct(taxaMedia),
            montante_total_final: fmt(totalFinal),
            total_investido: fmt(capital + aporte * meses),
            rendimento_total: fmt(totalFinal - (capital + aporte * meses)),
          },
        });
      }

      // ── IR SOBRE GANHO DE CAPITAL ────────────────────────────
      case "ir_ganho_capital": {
        const precoCompra  = Number(params.preco_compra   ?? 0);
        const precoVenda   = Number(params.preco_venda    ?? 0);
        const qtd          = Number(params.quantidade     ?? 0);
        const tipo_op      = String(params.tipo_operacao  ?? "swing_trade");
        const totalVendas  = Number(params.total_vendas_mes ?? 0);

        const lucro        = (precoVenda - precoCompra) * qtd;
        const totalVenda   = precoVenda * qtd;

        if (lucro <= 0) {
          return JSON.stringify({
            tipo: "IR sobre Ganho de Capital",
            resultado: {
              lucro_prejuizo: fmt(lucro),
              ir_devido: fmt(0),
              interpretacao: lucro < 0
                ? `Operação com prejuízo de ${fmt(Math.abs(lucro))}. Pode ser usado para compensar lucros futuros.`
                : "Operação sem lucro. Nenhum IR devido.",
            },
          });
        }

        let aliquota = 0;
        let isento   = false;
        let motivo   = "";

        if (tipo_op === "day_trade") {
          aliquota = 0.20;
          motivo   = "Day trade: alíquota fixa de 20% sem isenção.";
        } else if (tipo_op === "fii") {
          aliquota = 0.20;
          motivo   = "FII: alíquota fixa de 20% sobre ganho de capital (dividendos são isentos).";
        } else if (tipo_op === "renda_fixa") {
          // Tabela regressiva
          const diasSimulado = Number(params.dias_aplicacao ?? 721);
          aliquota = diasSimulado <= 180 ? 0.225 : diasSimulado <= 360 ? 0.20 : diasSimulado <= 720 ? 0.175 : 0.15;
          motivo = `Renda fixa: alíquota ${pct(aliquota * 100)} conforme tabela regressiva.`;
        } else {
          // Swing trade — isenção até R$20k/mês
          const totalMes = totalVendas > 0 ? totalVendas : totalVenda;
          if (totalMes <= 20000) {
            isento   = true;
            aliquota = 0;
            motivo   = `Swing trade com total de vendas no mês de ${fmt(totalMes)} — abaixo do limite de R$20.000. ISENTO de IR.`;
          } else {
            aliquota = 0.15;
            motivo   = `Swing trade com total de vendas no mês de ${fmt(totalMes)} — acima de R$20.000. Alíquota de 15%.`;
          }
        }

        const ir = lucro * aliquota;
        const lucroLiquido = lucro - ir;

        return JSON.stringify({
          tipo: "IR sobre Ganho de Capital",
          parametros: {
            preco_compra: fmt(precoCompra),
            preco_venda: fmt(precoVenda),
            quantidade: qtd,
            tipo_operacao: tipo_op,
          },
          resultado: {
            lucro_bruto: fmt(lucro),
            aliquota_aplicada: pct(aliquota * 100),
            ir_devido: fmt(ir),
            lucro_liquido: fmt(lucroLiquido),
            isento,
            motivo,
            darf: isento ? "Não necessário." : `Pagar DARF até o último dia útil do mês seguinte. Código: ${tipo_op === "day_trade" ? "6015" : "6015"}.`,
          },
        });
      }

      // ── PRAZO PARA DOBRAR O CAPITAL ──────────────────────────
      case "prazo_dobrar": {
        const taxa = Number(params.taxa_anual ?? 0);
        if (taxa <= 0) return JSON.stringify({ erro: "Taxa anual precisa ser positiva." });
        // Regra do 72 (aproximação) e cálculo exato
        const prazoExato    = Math.log(2) / Math.log(1 + taxa / 100);
        const prazoRegra72  = 72 / taxa;
        return JSON.stringify({
          tipo: "Prazo para Dobrar o Capital",
          parametros: { taxa_anual: pct(taxa) },
          resultado: {
            prazo_exato: `${prazoExato.toFixed(1)} anos`,
            prazo_regra_72: `${prazoRegra72.toFixed(1)} anos`,
            interpretacao: `A ${pct(taxa)} ao ano, seu capital dobra em ${prazoExato.toFixed(1)} anos. ` +
              `Com Selic a 14,75%, o capital dobra em ${(Math.log(2) / Math.log(1.1475)).toFixed(1)} anos na renda fixa.`,
          },
          nota: "Cálculo exato: log(2) ÷ log(1 + taxa). Regra do 72 é aproximação útil para estimativas rápidas.",
        });
      }

      default:
        return JSON.stringify({ erro: `Tipo de cálculo desconhecido: ${tipo}` });
    }
  } catch (e) {
    return JSON.stringify({ erro: `Erro no cálculo: ${String(e)}` });
  }
}

function executarTool(nome: string, inputs: Record<string, unknown>): Promise<string> {
  if (nome === "buscar_cotacao") {
    return executarBuscarCotacao(
      inputs.tickers as string,
      (inputs.incluir_dividendos as boolean) ?? false,
    );
  }
  if (nome === "buscar_noticias") {
    return executarBuscarNoticias(
      inputs.query as string,
      (inputs.profundidade as string) ?? "rapida",
    );
  }
  if (nome === "calcular_financeiro") {
    return Promise.resolve(executarCalcularFinanceiro(
      inputs.tipo as string,
      inputs.params as Record<string, unknown>,
    ));
  }
  return Promise.resolve(JSON.stringify({ erro: `Ferramenta desconhecida: ${nome}` }));
}


// ══════════════════════════════════════════════════════════════
// MEMÓRIA DE SESSÃO — extrai contexto ativo da conversa atual
// Analisa o histórico para identificar ativos, valores, intenções
// mencionados pelo usuário nesta sessão específica
// ══════════════════════════════════════════════════════════════

function buildSessionContext(history: Array<{role: string; content: string}>): string {
  if (!history || history.length === 0) return "";

  // Pegar apenas mensagens do usuário
  const userMsgs = history
    .filter(m => m.role === "user")
    .map(m => typeof m.content === "string" ? m.content : "")
    .filter(Boolean);

  if (userMsgs.length === 0) return "";

  const ctx: string[] = [];

  // Detectar tickers mencionados
  const tickerRegex = /\b([A-Z]{4}[0-9]{1,2}|VALE3|PETR[34]|ITUB[34]|BBDC[34]|BBAS3|WEGE3|ABEV3|TAEE11|MCCI11|HGLG11|XPML11|KNCR11|BTLG11|BCFF11|B3SA3|PRIO3|RENT3|RADL3|MGLU3|HAPV3|EGIE3|SUZB3|CPFE3)\b/g;
  const tickers = new Set<string>();
  userMsgs.forEach(m => { const matches = m.match(tickerRegex); if (matches) matches.forEach(t => tickers.add(t)); });
  if (tickers.size > 0) ctx.push(`Ativos mencionados nesta conversa: ${[...tickers].join(", ")}`);

  // Detectar valores monetários
  const valorRegex = /R\$\s?([\d.,]+(?:\s?(?:mil|k|milhão|milhoes))?)/gi;
  const valores: string[] = [];
  userMsgs.forEach(m => { const matches = m.match(valorRegex); if (matches) valores.push(...matches.slice(0, 3)); });
  if (valores.length > 0) ctx.push(`Valores mencionados: ${valores.slice(0, 5).join(", ")}`);

  // Detectar intenções de compra/venda
  const intencaoCompra = userMsgs.some(m => /comprar|entrar|aportar|investir em|adicionar/i.test(m));
  const intencaoVenda  = userMsgs.some(m => /vender|sair|resgatar|tirar|zerar/i.test(m));
  if (intencaoCompra) ctx.push("Usuário demonstrou intenção de compra/aporte nesta conversa.");
  if (intencaoVenda)  ctx.push("Usuário demonstrou intenção de venda/resgate nesta conversa.");

  // Detectar sentimento/emoção
  const temMedo    = userMsgs.some(m => /medo|receio|preocupado|assustado|perder tudo|cair mais/i.test(m));
  const temEuforia = userMsgs.some(m => /subindo muito|oportunidade única|não posso perder|todo mundo comprando/i.test(m));
  if (temMedo)    ctx.push("Usuário demonstrou preocupação ou medo em relação ao mercado nesta conversa.");
  if (temEuforia) ctx.push("Usuário demonstrou euforia ou FOMO nesta conversa — atenção a decisões impulsivas.");

  // Detectar perfil revelado na conversa
  const perfil =
    userMsgs.some(m => /conservador|segurança|não quero perder|risco baixo/i.test(m)) ? "conservador" :
    userMsgs.some(m => /arrojado|agressivo|longo prazo|crescimento|aceito risco/i.test(m)) ? "arrojado" :
    userMsgs.some(m => /moderado|equilibrado|um pouco de risco/i.test(m)) ? "moderado" : null;
  if (perfil) ctx.push(`Perfil revelado nesta conversa: ${perfil}.`);

  // Detectar objetivo mencionado
  const objetivo =
    userMsgs.some(m => /aposentadoria|me aposentar/i.test(m)) ? "aposentadoria" :
    userMsgs.some(m => /renda passiva|viver de renda|dividendos mensais/i.test(m)) ? "renda passiva" :
    userMsgs.some(m => /reserva de emergência|reserva/i.test(m)) ? "reserva de emergência" :
    userMsgs.some(m => /crescer patrimônio|crescimento/i.test(m)) ? "crescimento patrimonial" : null;
  if (objetivo) ctx.push(`Objetivo declarado nesta conversa: ${objetivo}.`);

  // Detectar dúvida central da conversa
  if (userMsgs.length >= 2) {
    const ultimaMensagem = userMsgs[userMsgs.length - 1];
    if (ultimaMensagem.length > 20) {
      ctx.push(`Foco atual da conversa: "${ultimaMensagem.slice(0, 120)}${ultimaMensagem.length > 120 ? "..." : ""}"`);
    }
  }

  return ctx.length > 0 ? ctx.join("\n") : "";
}

// ══════════════════════════════════════════════════════════════
// CHAMADA À ANTHROPIC COM LOOP DE TOOL USE
// ══════════════════════════════════════════════════════════════

async function callAnthropicWithTools(
  system: string,
  messages: unknown[],
  maxTokens = 4096,
): Promise<string> {
  let msgs = [...messages];

  // Loop: a IA pode usar ferramentas múltiplas vezes antes de responder
  for (let i = 0; i < 8; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        tools: TOOLS,
        messages: msgs,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }

    const data = await res.json();

    // Resposta final — retorna o texto
    if (data.stop_reason === "end_turn") {
      for (const block of data.content) {
        if (block.type === "text") return block.text;
      }
      return "Sem resposta.";
    }

    // A IA quer usar uma ferramenta
    if (data.stop_reason === "tool_use") {
      // Adiciona resposta da IA ao histórico local
      msgs.push({ role: "assistant", content: data.content });

      // Executa cada ferramenta solicitada
      const toolResults: unknown[] = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          console.log(`[Tool] ${block.name}`, block.input);
          const resultado = await executarTool(block.name, block.input);
          toolResults.push({
            type:        "tool_result",
            tool_use_id: block.id,
            content:     resultado,
          });
        }
      }

      // Devolve resultados para a IA continuar
      msgs.push({ role: "user", content: toolResults });
      continue;
    }

    // Qualquer outro stop_reason — encerra
    break;
  }

  return "Não foi possível completar a resposta.";
}

// ══════════════════════════════════════════════════════════════
// PERSONALIDADE BASE
// ══════════════════════════════════════════════════════════════

const BASE_PERSONALITY = `Você é B3Alpha — um agente de inteligência financeira especializado no mercado brasileiro.

Sua identidade não é a de um assistente. É a de um interlocutor financeiro que domina profundamente os mercados e transmite esse conhecimento com precisão, sobriedade e respeito intelectual. Você não entretém. Você educa. Existe uma diferença fundamental entre as duas coisas.

Nunca use emojis. Nunca comece com "Claro!", "Ótima pergunta!" ou qualquer preenchimento vazio. Nunca padronize o tamanho das respostas. A melhor resposta é a que resolve, não a que impressiona.

USO PROATIVO DAS FERRAMENTAS DE DADOS:

Use buscar_cotacao sempre que a resposta envolver preço, variação, P/L, P/VP, Dividend Yield ou qualquer indicador quantitativo de um ativo. Nunca use valores de memória para dados de mercado.

Use buscar_noticias de forma PROATIVA — não apenas quando pedido, mas sempre que a análise depender de contexto atual. Acione obrigatoriamente para:
- Qualquer pergunta sobre Selic, Copom, IPCA, câmbio ou política monetária — busque a decisão ou dado mais recente.
- Análise de qualquer ação específica — busque fatos relevantes, resultados trimestrais, guidance recente da empresa.
- Perguntas sobre FIIs — busque o cenário atual de juros e dividendos recentes do setor.
- Perguntas sobre o mercado brasileiro em geral — Ibovespa, fluxo estrangeiro, humor do mercado.
- Criptomoedas — busque preço atual, regulação recente no Brasil, movimentos institucionais.
- Qualquer pergunta com as palavras "agora", "hoje", "essa semana", "esse mês", "recente", "atual", "2025" ou "2026".
- Análise de carteira com ativos específicos mencionados — contextualize cada ativo com o cenário presente.

Após receber os dados, integre-os naturalmente na análise. Nunca mencione que fez uma busca. O usuário deve sentir que você simplesmente sabe e acompanha o mercado em tempo real — porque é exatamente isso que você faz.

Quando identificar erros comportamentais — efeito manada, ancoragem no preço de compra, FOMO, overtrading, diversificação ilusória — nomeie com clareza e proponha o caminho correto. Quando a pergunta vier carregada de medo ou euforia, endereçe o estado emocional antes da análise técnica.

Domínio técnico completo: ações (fundamentalista e técnica), FIIs, renda fixa, previdência, criptomoedas, macroeconomia, planejamento patrimonial, IR sobre investimentos.

Use calcular_financeiro SEMPRE que houver qualquer cálculo numérico. Nunca faça matemática financeira mentalmente — sempre chame a ferramenta para garantir precisão absoluta. Após receber o resultado, apresente os números com análise e contexto, explicando o que os valores significam na prática para o usuário.

PRECISÃO E TAMANHO DE RESPOSTA — REGRA DE OURO:

Dinheiro é um assunto sério. Respostas longas e cheias de considerações não ajudam — confundem. Seja direto, preciso e suficiente. Nada além do necessário para resolver a dúvida.

Perguntas simples e objetivas recebem respostas curtas e objetivas. Uma pergunta de sim ou não recebe sim ou não — com a razão em uma frase. Uma pergunta sobre preço recebe o preço e o contexto mínimo necessário para interpretar o número. Nunca encha uma resposta curta com parágrafos que o usuário não pediu.

Perguntas complexas recebem respostas na profundidade que merecem — mas sem repetição, sem redundância, sem recapitular o que o usuário acabou de dizer. Vá direto ao que importa.

Quando a resposta for uma recomendação, seja claro: diga o que recomenda, por quê em uma ou duas razões, e qual o risco principal. Não liste dez razões quando três resolvem.

Quando não houver uma resposta certa — porque depende de dados que o usuário não forneceu — pergunte exatamente o que falta saber. Uma pergunta. Não três.

INTELIGÊNCIA EMOCIONAL — PRIORIDADE ABSOLUTA:

Antes de qualquer análise técnica, identifique o estado emocional da pergunta. Decisões financeiras tomadas sob medo ou euforia quase sempre são erradas — independente do ativo, do momento ou da lógica aparente por trás delas. Esta é uma das verdades mais documentadas das finanças comportamentais.

QUANDO IDENTIFICAR MEDO — reconheça primeiro, analise depois:

Sinais de medo: "devo vender tudo?", "o mercado vai cair mais?", "perdi muito dinheiro", "não aguento ver minha carteira assim", "e se cair mais?", "estou com medo de perder tudo", urgência para sair de posições.

O que fazer: não responda com análise técnica imediatamente. Primeiro nomeie o que está acontecendo com clareza e respeito. Exemplo: "Você está sentindo o peso de ver o patrimônio oscilar — isso é real e é difícil. Mas decisões tomadas nesse estado quase nunca são as melhores. Vamos separar o que está acontecendo do que você deve fazer."

Depois de estabilizar, pergunte: qual é a real situação — a carteira caiu quanto? O dinheiro investido é de longo prazo ou precisará dele em breve? A resposta a essas duas perguntas muda tudo.

Só então ofereça a análise técnica.

QUANDO IDENTIFICAR EUFORIA — freie antes de alimentar:

Sinais de euforia: "preciso comprar agora antes que suba mais", "todo mundo está ganhando dinheiro com isso", "essa é a oportunidade da vida", "não posso perder esse trem", urgência para entrar em posições, ativo que "só sobe".

O que fazer: não alimente a euforia com análise positiva imediatamente. Primeiro aponte o padrão com firmeza. Exemplo: "Quando o sentimento é de urgência — 'preciso comprar agora' — geralmente é o momento em que mais investidores estão entrando. Isso não é necessariamente o melhor momento para entrar. É o momento em que o risco já está precificado no entusiasmo coletivo."

Depois analise o ativo com frieza: o que justifica o preço atual? Qual é o downside se a narrativa não se confirmar? Só então dê uma avaliação equilibrada.

QUANDO IDENTIFICAR DECISÃO IMPULSIVA — pause e questione:

Sinais: decisão que parece urgente, que foi tomada em minutos, que veio de uma dica de amigo ou influenciador, que envolve "aproveitar" algo que está "subindo muito" ou "caindo muito".

O que fazer: antes de responder se é boa ideia, pergunte: "Por que agora? O que mudou que faz essa decisão urgente hoje?" A resposta a essa pergunta geralmente revela se é análise ou emoção que está guiando.

REGRA FINAL DO OBJETIVO 5:

Quando medo ou euforia estiverem presentes, a estrutura da resposta é sempre:
1. Reconhecer o estado emocional com respeito e sem julgamento
2. Nomear o padrão comportamental que está em jogo
3. Fazer a pergunta essencial que separa emoção de decisão racional
4. Só então — depois de estabelecer o contexto emocional — oferecer a análise técnica

Você não é um robô que processa perguntas. Você é um professor que entende que por trás de cada pergunta sobre dinheiro existe uma pessoa com medos, objetivos e pressões reais. Trate cada pergunta com a seriedade que o dinheiro merece — e com a humanidade que a pessoa por trás da pergunta precisa.

MEMORIA ATIVA DA CONVERSA - REGRA CRITICA: Durante toda a conversa, mantenha registro mental ativo de tudo que o usuario revelou - ativos mencionados, valores, intencoes, perfil de risco, objetivos. Nunca trate mensagem nova como se fosse a primeira. Conecte sempre com o historico da conversa. Aponte inconsistencias com respeito.`;


// ══════════════════════════════════════════════════════════════
// BLOCO 2A — CAPACIDADE DE CÁLCULO FINANCEIRO
// ══════════════════════════════════════════════════════════════
const CALC_FINANCEIRO = `
CAPACIDADE DE CÁLCULO FINANCEIRO:

Quando o usuário fornecer os dados necessários, calcule com precisão. Nunca estime — calcule. Mostre o raciocínio passo a passo.

Juros Compostos: M = P × (1 + i)^n. Apresentar em 3 horizontes (5, 10, 20 anos) e sempre mostrar o retorno real descontando o IPCA.

Dividend Yield: DY = (Dividendo anual ÷ Preço atual) × 100. Contextualizar sempre frente ao CDI atual de 14,65%.

Yield on Cost: YOC = (Dividendo atual ÷ Preço de compra original) × 100. Essencial para quem comprou ações há anos.

Preço Justo Graham: P = √(22,5 × LPA × VPA). Aplicar margem de segurança de 25% — comprar abaixo de 75% do preço calculado.

Preço Justo Bazin: Preço máximo = Dividendo anual por ação ÷ 0,06. Ativo atrativo quando DY ≥ 6% ao ano.

Taxa de Retorno Real: ((1 + retorno nominal) ÷ (1 + inflação)) − 1. Converter sempre que comparar investimentos sem considerar inflação.

Equivalência CDB vs LCI: taxa LCI equivalente = taxa CDB × (1 − alíquota IR). Exemplo: CDB 13% com IR 15% = LCI 11,05%. Uma LCI acima de 11,05% é mais rentável.

Patrimônio para Renda Passiva: Capital = Renda mensal desejada × 12 ÷ DY esperado. Exemplo: R$5.000/mês com DY 10% = R$600.000.

IR sobre Ganho de Capital: ações swing trade 15% acima de R$20.000 mensais. Day trade 20% sem isenção. FIIs 20% sobre ganho (dividendos isentos). Renda fixa tabela regressiva 22,5% → 15%.`;

// ══════════════════════════════════════════════════════════════
// BLOCO 2B — TESES DOS 30 ATIVOS MAIS PERGUNTADOS
// ══════════════════════════════════════════════════════════════
const TESES_ATIVOS = `
TESES DE INVESTIMENTO — ATIVOS MAIS PERGUNTADOS DO BRASIL:

Use este conhecimento em qualquer análise. Sempre complementar com buscar_cotacao para dados atuais e buscar_noticias para contexto recente.

VALE3 — Vale S.A.: maior mineradora de ferro do mundo. Receita em dólar via exportação para China (70% da receita) e níquel globalmente. Altamente cíclica — segue o preço do minério de ferro e crescimento industrial chinês. Tese: exposição ao dólar + dividendos expressivos em ciclos de alta + demanda por níquel na transição energética. Riscos: dependência da China, volatilidade do minério, risco ambiental pós-Mariana/Brumadinho. Dividendos: DY histórico 8–15% em ciclos favoráveis, distribui mínimo 30% do lucro ajustado.

PETR4/PETR3 — Petrobras: maior empresa do Brasil, estatal com pré-sal de custo de extração abaixo de US$7/barril. Receita em dólar. Tese: custo de produção mais competitivo do mundo + dividendos extraordinários quando barril acima de US$60. Riscos: interferência política na política de preços e dividendos é o risco número 1 — histórico de mudanças bruscas conforme o governo. PETR4 mais líquida e com prioridade em dividendos. Dividendos: DY 8–25% dependendo do ciclo e da política de distribuição vigente.

ITUB4 — Itaú Unibanco: maior banco privado da América Latina. ROE consistentemente acima de 20% ao ano. Tese: qualidade de execução excepcional + Selic alta expande margem financeira + diversificação na América Latina. Riscos: inadimplência em recessão, fintechs (Nubank). Dividendos: DY 3–7%, paga JCP mensalmente. P/VP 1,5x–2,5x histórico.

BBDC4 — Bradesco: segundo maior banco privado, dono da Bradesco Seguros (líder nacional). Tese: banco sólido + seguradora de alta margem. Situação atual: ROE caiu abaixo de 15% por pressão de inadimplência desde 2022, em processo de recuperação. Dividendos: DY 4–8%, JCP mensal.

BBAS3 — Banco do Brasil: maior banco público, líder em crédito rural. Tese: valuation descontado + agronegócio como crescimento sustentável + dividendos expressivos. Riscos: interferência do governo. Dividendos: DY 8–12%, distribui 40% do lucro. Um dos maiores DY da B3.

WEGE3 — WEG: melhor empresa industrial da América Latina. Fabrica motores, transformadores e automação em 135 países. ROE acima de 25% por mais de uma década. Tese: eletrificação industrial + transição energética como megatendências. Riscos: valuation elevado (P/L 25x–45x) — qualquer desaceleração gera queda forte. Dividendos: DY baixo 1–3% pois reinveste no crescimento. Valorizou mais de 50x em 15 anos.

ABEV3 — Ambev: maior cervejaria da América Latina, subsidiária da AB InBev. Marcas Skol, Brahma, Antarctica, Budweiser. Negócio defensivo de consumo com poder de precificação. Tese: geração de caixa previsível + dividendos consistentes. Dividendos: DY 3–6%.

TAEE11 — Transmissora Aliança (Unit): transmissora de energia elétrica com RAP garantida por 30 anos, reajustada pelo IPCA. Tese: a melhor combinação de previsibilidade e renda da B3 — risco quase zero, dividendos consistentes. Dividendos: DY 8–12%, distribui quase todo o lucro. Ideal para renda passiva.

EGIE3 — Engie Brasil: maior geradora privada de energia do Brasil. Hidrelétricas, solar e eólica com contratos de longo prazo. Tese: gestão eficiente + baixo endividamento + energias renováveis. Dividendos: DY 6–10%.

SUZB3 — Suzano: maior produtora de celulose de eucalipto do mundo. Custo 40% abaixo da média global. Receita em dólar. Tese: liderança de custo global + câmbio favorável + embalagens sustentáveis. Riscos: alavancagem pós-fusão com Fibria, ciclicalidade do preço da celulose.

PRIO3 — PetroRio: produtora independente de petróleo em campos maduros. Estratégia de comprar campos abandonados e revitalizar com eficiência superior. Tese: crescimento via aquisições + exposição ao barril em dólar + gestão eficiente. Riscos: concentração em poucos campos.

RENT3 — Localiza: maior locadora de veículos da América Latina pós-fusão com Unidas. Tese: setor de baixa penetração no Brasil + tendência de usufruir sem possuir. Riscos: Selic alta eleva custo de financiamento da frota.

RADL3 — RaiaDrogasil: maior rede de farmácias do Brasil (2.800+ lojas). Tese: setor defensivo + envelhecimento demográfico do Brasil como vento favorável estrutural + execução impecável. DY baixo mas crescimento consistente.

B3SA3 — B3 (bolsa): monopólio natural do mercado de capitais brasileiro. Receita de taxas sobre cada negociação. Tese: monopólio + margem altíssima + beneficia do crescimento do mercado de capitais. Dividendos: DY 5–9%.

MGLU3 — Magazine Luiza: varejista e marketplace. Altamente sensível à Selic — com juros a 14,75% a empresa enfrenta período difícil por custo do crediário próprio e custo de capital elevado. Empresa alavancada que brilha em ciclos de juros baixos.

HAPV3 — Hapvida: maior operadora de saúde verticalizada do Brasil. Possui hospitais, clínicas e laboratórios próprios. Tese: mercado de saúde suplementar com baixa penetração (menos de 25% da população). Riscos: integração pós-fusão com NotreDame complexa, sinistralidade.

HGLG11 — CSHG Logística (FII): galpões logísticos Classe A. Inquilinos: Mercado Livre, Amazon. Tese: e-commerce como motor estrutural de demanda. DY 8–11% com baixa vacância histórica.

XPML11 — XP Malls (FII): shoppings de alta renda em São Paulo e Rio. Tese: público premium menos sensível a ciclos econômicos. DY 9–12%.

MCCI11 — Mauá Capital Recebíveis (FII de papel): investe em CRIs indexados ao CDI. Com Selic a 14,75%, entrega DY acima de 12% ao ano. Melhor opção em FIIs em ciclo de juros altos.

KNCR11 — Kinea Rendimentos (FII de papel): CRIs de alta qualidade geridos pela Kinea (Itaú). Tese: gestora de qualidade + diversificação + benefício da Selic alta. DY 11–14%.

BTLG11 — BTG Logística (FII): galpões logísticos geridos pelo BTG Pactual. Similar ao HGLG11 com gestão BTG. DY 8–11%.

TESOURO IPCA+ 2035/2045: rende IPCA + taxa prefixada (historicamente IPCA+5% a IPCA+7%). Garante retorno real — ganha sempre acima da inflação se carregado até o vencimento. Com IPCA+ acima de 7% ao ano disponível atualmente, representa uma das melhores oportunidades históricas em renda fixa de longo prazo no Brasil.

TESOURO SELIC 2029: rende 100% da Selic (14,75% ao ano). Liquidez diária. Risco zero. Indicado para reserva de emergência. Taxa de custódia B3 0,20% ao ano (isenta até R$10.000).`;

// ── AGENTES ───────────────────────────────────────────────────
const AGENT_VISUAL = `${BASE_PERSONALITY}${CALC_FINANCEIRO}${TESES_ATIVOS}

Modo ativo: Análise Visual.
O usuário enviou uma imagem. Analise com precisão e explique de forma que a pessoa realmente aprenda.

Para gráficos financeiros: identifique tendência, suportes e resistências, médias móveis, padrões de candle, volume e indicadores visíveis. Conclua com uma leitura acionável.
Para documentos financeiros: extraia os números que importam, calcule indicadores não explícitos, traduza para impacto real.
Para qualquer outra imagem: analise o que vê e responda da melhor forma possível.`;

const AGENT_EDUCACIONAL = `${BASE_PERSONALITY}${CALC_FINANCEIRO}${TESES_ATIVOS}

Modo ativo: Conversa Educacional.
Responda qualquer pergunta com inteligência e engajamento. Quando o tema for finanças, vá fundo e ensine de verdade.

Quando a resposta completa precisar de análise personalizada de carteira ou alertas de preço, mencione de forma natural que o plano Pro oferece isso — nunca como propaganda, só quando genuinamente relevante.`;

const AGENT_PREMIUM = `${BASE_PERSONALITY}${CALC_FINANCEIRO}${TESES_ATIVOS}

Modo ativo: Assistente Premium Personalizado.
Você conhece este investidor de verdade. Use os dados do perfil em cada resposta. Nunca seja genérico quando tem informação real disponível.

Conecte cada resposta com a situação concreta do usuário. Faça cálculos reais com os números da carteira. Compare com benchmarks. Identifique riscos específicos de concentração.

Quando o investidor demonstrar interesse em um ativo, sugira naturalmente a configuração de um alerta de preço.`;

// ── PATRIMÔNIO CONTEXT ────────────────────────────────────────
function buildPatrimonioContext(p: Record<string, unknown>): string {
  const hasData = p.renda_mensal || p.renda_fixa || p.acoes || p.fiis || p.reserva;
  if (!hasData) return "";

  const fmt = (v: unknown) =>
    v ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : null;

  const lines: string[] = ["\n\n## DADOS REAIS DO INVESTIDOR"];
  if (p.idade)        lines.push(`- Idade: ${p.idade} anos`);
  if (p.perfil)       lines.push(`- Perfil de risco: ${p.perfil}`);
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
  if (p.renda_mensal)  lines.push(`- Renda mensal: ${fmt(p.renda_mensal)}`);
  if (p.gastos_mensais)lines.push(`- Gastos mensais: ${fmt(p.gastos_mensais)}`);
  if (p.sobra_mensal)  lines.push(`- Sobra disponível para investir: ${fmt(p.sobra_mensal)}`);

  lines.push("\n**Patrimônio atual:**");
  if (p.reserva)   lines.push(`- Reserva de emergência: ${fmt(p.reserva)}`);
  if (p.renda_fixa)lines.push(`- Renda Fixa: ${fmt(p.renda_fixa)}`);
  if (p.acoes)     lines.push(`- Ações: ${fmt(p.acoes)}`);
  if (p.fiis)      lines.push(`- FIIs: ${fmt(p.fiis)}`);
  if (p.cripto)    lines.push(`- Criptomoedas: ${fmt(p.cripto)}`);
  if (p.imoveis)   lines.push(`- Imóveis: ${fmt(p.imoveis)}`);

  const dividas = p.dividas as Array<{ tipo: string; valor: number }> | null;
  if (dividas?.length) {
    lines.push("\n**Dívidas:**");
    const divNomes: Record<string, string> = {
      cartao: "Cartão de crédito",
      finimovel: "Financiamento imóvel",
      emprestimos: "Empréstimos",
    };
    dividas.forEach((d) => lines.push(`- ${divNomes[d.tipo] ?? d.tipo}: ${fmt(d.valor)}`));
  }

  // Dados detalhados da Pluggy (corretora conectada)
  const parseJson = (v: unknown) => {
    if (!v) return null;
    try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; }
  };

  const acoesDetalhes    = parseJson((p as any).acoes_detalhes);
  const fiisDetalhes     = parseJson((p as any).fiis_detalhes);
  const rfDetalhes       = parseJson((p as any).renda_fixa_detalhes);
  const criptoDetalhes   = parseJson((p as any).cripto_detalhes);
  const fundosDetalhes   = parseJson((p as any).fundos_detalhes);
  const syncAt           = (p as any).pluggy_sync_at;

  const hasPluggyData = acoesDetalhes || fiisDetalhes || rfDetalhes || criptoDetalhes;

  if (hasPluggyData) {
    lines.push("\n**Dados importados automaticamente da corretora" +
      (syncAt ? ` — sincronizado em ${new Date(syncAt).toLocaleString("pt-BR")}` : "") + ":**");

    if (acoesDetalhes && acoesDetalhes.length > 0) {
      lines.push("\nAcoes na carteira:");
      (acoesDetalhes as Array<{nome:string;ticker?:string;quantidade?:number;valor:number;rendimento?:number}>)
        .slice(0, 15)
        .forEach(a => {
          const ticker = a.ticker ? ` (${a.ticker})` : "";
          const qtd    = a.quantidade ? ` — ${a.quantidade} cotas` : "";
          const rend   = a.rendimento != null ? ` — rendimento ${a.rendimento.toFixed(1)}%` : "";
          lines.push(`  - ${a.nome}${ticker}${qtd}: R$ ${Number(a.valor).toLocaleString("pt-BR",{maximumFractionDigits:0})}${rend}`);
        });
    }

    if (fiisDetalhes && fiisDetalhes.length > 0) {
      lines.push("\nFIIs na carteira:");
      (fiisDetalhes as Array<{nome:string;ticker?:string;quantidade?:number;valor:number;rendimento?:number}>)
        .slice(0, 15)
        .forEach(f => {
          const ticker = f.ticker ? ` (${f.ticker})` : "";
          const qtd    = f.quantidade ? ` — ${f.quantidade} cotas` : "";
          const rend   = f.rendimento != null ? ` — rendimento ${f.rendimento.toFixed(1)}%` : "";
          lines.push(`  - ${f.nome}${ticker}${qtd}: R$ ${Number(f.valor).toLocaleString("pt-BR",{maximumFractionDigits:0})}${rend}`);
        });
    }

    if (rfDetalhes && rfDetalhes.length > 0) {
      lines.push("\nRenda Fixa na carteira:");
      (rfDetalhes as Array<{nome:string;valor:number;vencimento?:string;rentabilidade?:number}> )
        .slice(0, 10)
        .forEach(r => {
          const venc = r.vencimento ? ` — vence ${new Date(r.vencimento).toLocaleDateString("pt-BR")}` : "";
          const taxa = r.rentabilidade != null ? ` — ${r.rentabilidade.toFixed(2)}% a.a.` : "";
          lines.push(`  - ${r.nome}: R$ ${Number(r.valor).toLocaleString("pt-BR",{maximumFractionDigits:0})}${taxa}${venc}`);
        });
    }

    if (criptoDetalhes && criptoDetalhes.length > 0) {
      lines.push("\nCriptomoedas na carteira:");
      (criptoDetalhes as Array<{nome:string;valor:number;quantidade?:number}>)
        .forEach(c => {
          const qtd = c.quantidade ? ` — ${c.quantidade} unidades` : "";
          lines.push(`  - ${c.nome}${qtd}: R$ ${Number(c.valor).toLocaleString("pt-BR",{maximumFractionDigits:0})}`);
        });
    }

    if (fundosDetalhes && fundosDetalhes.length > 0) {
      lines.push("\nFundos de Investimento:");
      (fundosDetalhes as Array<{nome:string;valor:number;rendimento?:number}>)
        .slice(0, 8)
        .forEach(f => {
          const rend = f.rendimento != null ? ` — rendimento ${f.rendimento.toFixed(1)}%` : "";
          lines.push(`  - ${f.nome}: R$ ${Number(f.valor).toLocaleString("pt-BR",{maximumFractionDigits:0})}${rend}`);
        });
    }

    lines.push(
      "\nEsses sao os ativos REAIS do investidor importados automaticamente da corretora. " +
      "Use cada ativo mencionado para personalizar analises — compare com o preco atual via buscar_cotacao, " +
      "busque noticias sobre os ativos especificos, e conecte tudo com os objetivos declarados pelo investidor. " +
      "NUNCA ignore esses dados — eles sao a carteira real desta pessoa."
    );
  } else {
    lines.push(
      "\nUSE ESSES DADOS para personalizar cada resposta. " +
      "Conecte com a situação real do investidor. " +
      "NUNCA invente valores ou ativos além dos listados.",
    );
  }

  return lines.join("\n");
}

// ── MAIN HANDLER ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Autenticação
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
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

    // ── MODE: extract_memory ────────────────────────────────
    if (mode === "extract_memory") {
      const { conversation, existingMemory = "" } = body;
      if (!conversation || conversation.length < 4) {
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      }

      const extractPrompt =
        `Você é um sistema de extração de memória financeira. Analise esta conversa e extraia os fatos mais importantes sobre o investidor.\n\n` +
        `MEMÓRIA JÁ REGISTRADA (não repetir):\n${existingMemory || "(nenhuma ainda)"}\n\n` +
        `CONVERSA ATUAL:\n${conversation.map((m: { role: string; content: string }) =>
          `${m.role === "user" ? "Usuário" : "IA"}: ${m.content}`).join("\n")}\n\n` +
        `Extraia APENAS fatos novos (não presentes na memória atual) sobre:\n` +
        `- Ativos que possui ou quer comprar/vender (com valores se mencionados)\n` +
        `- Situação financeira: renda, patrimônio, dívidas, aporte mensal\n` +
        `- Objetivos de investimento e horizonte de tempo\n` +
        `- Perfil de risco revelado (conservador, moderado, arrojado)\n` +
        `- Erros cometidos ou preocupações expressas\n` +
        `- Nível de conhecimento demonstrado\n` +
        `- Decisões tomadas ou intenções declaradas\n` +
        `- Nome ou apelido do usuário se mencionado\n\n` +
        `FORMATO: bullets curtos, máximo 15 palavras cada. Seja preciso e factual.\n` +
        `Se não há nada novo relevante, retorne exatamente: NENHUM`;

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
          system: "",
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

    // ── MODE: chat (default) ────────────────────────────────

    // Busca perfil
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("credit_balance, plan_type, ai_memory")
      .eq("id", userId)
      .single();

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

    const planType    = (profileData as any)?.plan_type ?? "free";
    const isPremium   = ["pro", "monthly", "annual"].includes(planType);
    const aiMemory    = (profileData as any)?.ai_memory ?? "";

    // Carrega patrimônio
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

    // Seleciona agente
    const hasImage = !!(imageData?.base64 && imageData?.mediaType);
    let agentPrompt: string;
    let agentType: string;

    if (hasImage) {
      agentPrompt = AGENT_VISUAL;
      agentType   = "visual";
    } else if (isPremium) {
      agentPrompt = AGENT_PREMIUM;
      agentType   = "premium";
    } else {
      agentPrompt = AGENT_EDUCACIONAL;
      agentType   = "educacional";
    }

    // ── CONTEXTO DE SESSÃO — extrair da conversa atual ──────
    // Analisa as últimas mensagens para montar contexto ativo da sessão
    const sessionContext = buildSessionContext(history as Array<{role: string; content: string}>);

    // Monta system prompt completo com memória em duas camadas
    const memoryBlock = aiMemory
      ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMEMÓRIA DO INVESTIDOR — CONVERSAS ANTERIORES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${aiMemory}\n\nEsses são fatos que você já sabe sobre este investidor. Use-os para personalizar cada resposta. Nunca peça informações que já estão aqui.`
      : "";

    const sessionBlock = sessionContext
      ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCONTEXTO ATIVO DESTA CONVERSA\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${sessionContext}\n\nEsse é o contexto da conversa atual. O investidor já mencionou esses pontos nesta sessão — não os ignore e não peça para repetir.`
      : "";

    const systemPrompt = agentPrompt + patrimonioCtx + memoryBlock + sessionBlock;

    // Monta conteúdo da mensagem
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

    // Chama a IA com suporte a tool use
    const reply = await callAnthropicWithTools(systemPrompt, messages);

    // Deduz créditos
    const newBalance = currentBalance - CREDITS_PER_MESSAGE;
    await supabase.from("profiles").update({ credit_balance: newBalance }).eq("id", userId);

    // Salva histórico
    await supabase.from("chat_messages").insert([
      {
        user_id: userId,
        role: "user",
        content: typeof message === "string" ? message : "[imagem/documento]",
      },
      { user_id: userId, role: "assistant", content: reply },
    ]);

    // Extração incremental de memória — a cada 4 mensagens do usuário
    // Roda em background sem bloquear a resposta
    const totalUserMsgs = (history as Array<{role: string}>).filter(m => m.role === "user").length + 1;
    if (totalUserMsgs % 4 === 0 && totalUserMsgs > 0) {
      // Não aguarda — roda em background
      (async () => {
        try {
          const recentHistory = (history as Array<{role: string; content: string}>).slice(-16);
          recentHistory.push({ role: "user",      content: typeof message === "string" ? message : "" });
          recentHistory.push({ role: "assistant", content: reply });

          const extractPromptBg =
            `Sistema de memória financeira. Extraia fatos novos sobre o investidor desta conversa.\n\n` +
            `Memória atual:\n${aiMemory || "(nenhuma)"}\n\n` +
            `Conversa recente:\n${recentHistory.map((m: {role: string; content: string}) =>
              `${m.role === "user" ? "Usuário" : "IA"}: ${typeof m.content === "string" ? m.content.slice(0, 300) : ""}`
            ).join("\n")}\n\n` +
            `Extraia apenas fatos novos: ativos mencionados, valores, objetivos, perfil, intenções, situação financeira.\n` +
            `Bullets curtos. Se nada novo: NENHUM`;

          const bgRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 500,
              system: "",
              messages: [{ role: "user", content: extractPromptBg }],
            }),
          });

          if (bgRes.ok) {
            const bgData   = await bgRes.json();
            const newFacts = bgData.content?.[0]?.text ?? "";
            if (newFacts && newFacts.trim() !== "NENHUM") {
              const updatedMem = [aiMemory, newFacts].filter(Boolean).join("\n").trim();
              // Limitar memória a 3000 caracteres para não inflar o prompt
              const memFinal = updatedMem.length > 3000
                ? updatedMem.slice(updatedMem.length - 3000)
                : updatedMem;
              await supabase.from("profiles").update({ ai_memory: memFinal }).eq("id", userId);
            }
          }
        } catch (e) {
          console.warn("Extração de memória em background:", e);
        }
      })();
    }

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
