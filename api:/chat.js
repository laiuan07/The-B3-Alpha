// ═══════════════════════════════════════════════════════════
// B3 ALPHA — PROXY SEGURO PARA CLAUDE API
// Vercel Serverless Function
// ═══════════════════════════════════════════════════════════
// Esta função protege a API key do Claude
// O site faz requisições para /api/chat em vez de chamar diretamente a Anthropic
// ═══════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // ─── CORS Headers ───
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas POST permitido
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar se a API key está configurada
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API key não configurada no servidor'
    });
  }

  try {
    // ─── Validar body da requisição ───
    const { messages, system, max_tokens, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Campo "messages" é obrigatório'
      });
    }

    // ─── Rate Limiting básico (proteção extra) ───
    // Limitar tamanho do payload (proteção contra abuso)
    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > 50000) {
      return res.status(413).json({
        error: 'Mensagem muito grande'
      });
    }

    // ─── Chamar API da Anthropic ───
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1500,
        system: system || 'Você é a B3 Alpha IA, assistente de investimentos brasileiros.',
        messages: messages
      })
    });

    const data = await response.json();

    // ─── Tratar erros da Anthropic ───
    if (!response.ok) {
      console.error('Erro Anthropic:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Erro ao processar requisição',
        type: data.error?.type
      });
    }

    // ─── Retornar resposta ao site ───
    return res.status(200).json(data);

  } catch (error) {
    console.error('Erro no proxy:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
}
