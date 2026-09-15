import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY precisa estar definido (.env.local).');
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// Modelo default para os agentes clínicos. Mantido centralizado para
// facilitar troca/AB-test entre modelos conforme custo/latência exigidos
// pelo caso de uso em tempo real (Fase 2). claude-sonnet-5 é o melhor
// equilíbrio velocidade/qualidade hoje — troque para claude-opus-5 se
// precisar de mais rigor clínico e a latência permitir.
export const CLINICAL_AGENT_MODEL =
  process.env.CLINICAL_AGENT_MODEL ?? 'claude-sonnet-5';
