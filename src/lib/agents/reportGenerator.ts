import { z } from 'zod';
import { getAnthropicClient, CLINICAL_AGENT_MODEL } from '../anthropic';
import type { TranscriptSegment } from '../transcription';
import type { ClinicalAnalysis } from './clinicalAnalysis';

const ReportSchema = z.object({
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
});

export type SoapReport = z.infer<typeof ReportSchema>;

const SYSTEM_PROMPT = `Você gera o relatório final de uma consulta médica no
formato SOAP (Subjetivo, Objetivo, Avaliação, Plano) a partir da transcrição
literal e das hipóteses/perguntas levantadas durante o atendimento.

Regras:
- Baseie-se SOMENTE no que está na transcrição e nas análises fornecidas.
  Não invente achados de exame físico ou dados não mencionados.
- "Subjetivo": queixa e história relatadas pelo paciente, nas palavras dele
  quando relevante.
- "Objetivo": achados objetivos mencionados na consulta (sinais, exames
  citados). Se nada foi mencionado, declare isso explicitamente.
- "Avaliação": síntese das hipóteses diagnósticas discutidas, indicando o
  nível de confiança quando souber.
- "Plano": condutas/próximos passos mencionados ou sugeridos na consulta.
- Escreva em português, tom clínico e objetivo.

Responda SOMENTE em JSON válido:
{ "subjective": string, "objective": string, "assessment": string, "plan": string }`;

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

export async function generateSoapReport(
  segments: TranscriptSegment[],
  analyses: ClinicalAnalysis[]
): Promise<SoapReport> {
  const client = getAnthropicClient();

  const hypothesesSummary = analyses
    .flatMap((a) => a.hypotheses)
    .map((h) => `- ${h.condition} (confiança: ${h.confidence}) — ${h.rationale}`)
    .join('\n');

  const message = await client.messages.create({
    model: CLINICAL_AGENT_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          'Transcrição literal completa da consulta:',
          formatTranscript(segments),
          '',
          'Hipóteses diagnósticas discutidas ao longo da consulta:',
          hypothesesSummary || '(nenhuma hipótese registrada)',
        ].join('\n'),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Resposta do agente de relatório não contém texto.');
  }

  return ReportSchema.parse(JSON.parse(textBlock.text));
}
