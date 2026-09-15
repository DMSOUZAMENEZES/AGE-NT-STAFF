import { z } from 'zod';
import { getAnthropicClient, CLINICAL_AGENT_MODEL } from '../anthropic';
import { searchClinicalEvidence, type EvidenceResult } from '../skb';
import type { TranscriptSegment } from '../transcription';
import { parseModelJson } from '../jsonUtils';

const AnalysisSchema = z.object({
  hypotheses: z
    .array(
      z.object({
        condition: z.string(),
        rationale: z.string(),
        confidence: z.enum(['baixa', 'moderada', 'alta']),
      })
    )
    .default([]),
  suggested_questions: z
    .array(
      z.object({
        question: z.string(),
        rationale: z.string(),
      })
    )
    .default([]),
  evidence_queries: z.array(z.string()).default([]),
});

export type ClinicalAnalysis = z.infer<typeof AnalysisSchema> & {
  citedEvidence: EvidenceResult[];
};

const SYSTEM_PROMPT = `Você é um agente auxiliar de um médico durante um teleatendimento.
Seu papel é apoiar o raciocínio clínico do médico, NUNCA substituí-lo ou dar um
diagnóstico fechado. Com base na transcrição parcial da consulta fornecida:

1. Liste hipóteses diagnósticas plausíveis, com racional e nível de confiança
   (baixa/moderada/alta) — sempre como hipóteses a investigar, não conclusões.
2. Sugira perguntas objetivas que o médico poderia fazer ao paciente para
   diferenciar entre as hipóteses ou coletar dados faltantes relevantes.
3. Liste até 3 termos de busca (evidence_queries) que ajudariam a localizar
   diretrizes/protocolos oficiais relevantes para este caso.

Seja conservador: se a transcrição ainda tem pouca informação, diga isso
explicitamente nas hipóteses (ex. "dados insuficientes para hipótese X") em vez
de inventar detalhes que não foram ditos. Responda SOMENTE com o objeto JSON
abaixo, sem cercas de markdown (não use \`\`\`), sem texto antes ou depois, no
formato:
{
  "hypotheses": [{ "condition": string, "rationale": string, "confidence": "baixa"|"moderada"|"alta" }],
  "suggested_questions": [{ "question": string, "rationale": string }],
  "evidence_queries": [string]
}`;

function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const speakerLabel =
        s.speaker === 'doctor'
          ? 'Médico'
          : s.speaker === 'patient'
            ? 'Paciente'
            : 'Interlocutor';
      return `${speakerLabel}: ${s.text}`;
    })
    .join('\n');
}

/**
 * Roda uma passada de análise clínica sobre a transcrição acumulada até o
 * momento. Na Fase 1 isso é chamado uma vez (ou sob demanda) sobre a
 * transcrição completa; na Fase 2 passa a ser chamado incrementalmente
 * (gatilho por pausa/segmento novo) sobre o buffer da sessão em andamento.
 */
export async function runClinicalAnalysis(
  segments: TranscriptSegment[]
): Promise<ClinicalAnalysis> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: CLINICAL_AGENT_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Transcrição da consulta até o momento:\n\n${formatTranscript(segments)}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Resposta do agente de análise não contém texto.');
  }

  const parsed = AnalysisSchema.parse(parseModelJson(textBlock.text));

  // Busca evidência real no SKB para cada query sugerida pelo agente.
  const evidenceResults = await Promise.all(
    parsed.evidence_queries.map((q) => searchClinicalEvidence(q))
  );

  return {
    ...parsed,
    citedEvidence: evidenceResults.flat(),
  };
}
