/**
 * Cliente para o SKB (base de conhecimento clínico) já existente no projeto
 * apoio-diagnostico/DignosNeuro — Python/SQLite FTS5 com documentos oficiais
 * (CONITEC, BVS, SAPS) e a API `evidence.py`.
 *
 * Decisão do plano técnico: reaproveitar o SKB como serviço compartilhado em
 * vez de duplicar a base para o AGENTE STAFF. Este cliente assume que
 * `evidence.py` (ou um wrapper HTTP fino sobre ele) está exposto na sua VPS.
 *
 * Se esse serviço ainda não tiver um endpoint HTTP, o passo mais simples é
 * um wrapper FastAPI de ~20 linhas em cima da função de busca existente.
 */

export type EvidenceResult = {
  source: string; // ex. "CONITEC", "BVS", "SAPS"
  title: string;
  excerpt: string;
  reference: string; // URL ou identificador do documento
};

export async function searchClinicalEvidence(
  query: string,
  opts: { limit?: number } = {}
): Promise<EvidenceResult[]> {
  const baseUrl = process.env.SKB_SERVICE_URL;

  if (!baseUrl) {
    // Sem o serviço configurado, o agente ainda funciona — só não cita
    // evidência da base oficial. Deixamos isso explícito no resultado para
    // não fingir que há grounding quando não há.
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    limit: String(opts.limit ?? 5),
  });

  const res = await fetch(`${baseUrl}/evidence/search?${params.toString()}`);

  if (!res.ok) {
    throw new Error(
      `Falha ao consultar o SKB (${res.status}): ${await res.text()}`
    );
  }

  const data = (await res.json()) as { results: EvidenceResult[] };
  return data.results;
}
