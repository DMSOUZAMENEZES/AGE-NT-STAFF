/**
 * Modelos de linguagem às vezes envolvem a resposta JSON solicitada em
 * cercas de markdown (```json ... ```) ou acrescentam texto antes/depois,
 * mesmo quando o prompt pede "responda SOMENTE em JSON". Um `JSON.parse()`
 * cru quebra nesses casos. Esta função tenta extrair o JSON de forma
 * tolerante antes de decodificar, em vez de assumir que a resposta já vem
 * pura — sem isso, uma variação de formatação do modelo derruba o pipeline
 * inteiro com um erro pouco informativo ("Unexpected token '`'...").
 */
export function parseModelJson<T = unknown>(raw: string): T {
  const text = raw.trim();

  // Caso feliz: já é JSON puro.
  try {
    return JSON.parse(text) as T;
  } catch {
    // segue para as estratégias de recuperação abaixo
  }

  // Remove cercas de markdown (```json ... ``` ou ``` ... ```).
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      // segue para a última estratégia
    }
  }

  // Último recurso: pega o maior bloco entre a primeira '{' ou '[' e a
  // última '}' ou ']' correspondente no texto.
  const firstBrace = Math.min(
    ...[text.indexOf('{'), text.indexOf('[')].filter((i) => i !== -1)
  );
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));

  if (Number.isFinite(firstBrace) && firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate) as T; // deixa o erro propagar se ainda assim falhar
  }

  throw new Error(`Resposta do modelo não contém JSON reconhecível: ${text.slice(0, 200)}`);
}
