import { z } from 'zod';
import { getAnthropicClient, CLINICAL_AGENT_MODEL } from '../anthropic';
import type { TranscriptSegment } from '../transcription';
import type { ClinicalAnalysis } from './clinicalAnalysis';
import { parseModelJson } from '../jsonUtils';

/**
 * Clinical Challenger — auditor adversarial que revisa a saída do agente de
 * análise antes dela chegar à janela flutuante. Adaptação do componente
 * já usado no apoio-diagnostico/DignosNeuro (lá com um rubric de pontos
 * determinístico + escalonamento humano; aqui, uma primeira versão só com
 * auditoria qualitativa via LLM — o rubric determinístico fica para uma
 * próxima iteração, ver nota no final do arquivo).
 *
 * Papel: para cada hipótese levantada, checar se ela está de fato apoiada
 * pelo que foi dito na transcrição (não em conhecimento médico geral que o
 * modelo "preencheu"), e sinalizar quando uma hipótese de risco clínico
 * relevante está fracamente fundamentada — isso é o que dispara
 * `needs_human_review`, um aviso explícito para o médico revisar por conta
 * própria em vez de confiar na sugestão.
 */

const ChallengerSchema = z.object({
  audited_hypotheses: z
    .array(
      z.object({
        condition: z.string(),
        grounded: z.boolean(), // está apoiada no que foi dito na transcrição?
        audited_confidence: z.enum(['baixa', 'moderada', 'alta']),
        audit_note: z.string(),
      })
    )
    .default([]),
  needs_human_review: z.boolean().default(false),
  overall_note: z.string().default(''),
});

export type ChallengerReview = z.infer<typeof ChallengerSchema>;

const SYSTEM_PROMPT = `Você é o "Clinical Challenger": um auditor adversarial cujo único
trabalho é questionar as hipóteses diagnósticas geradas por outro agente de IA
antes que cheguem ao médico. Você NÃO gera novas hipóteses — só audita as que
recebeu.

Para cada hipótese recebida:
1. Verifique se ela está de fato apoiada por algo que foi DITO na transcrição
   (sintoma relatado, achado mencionado) — não em conhecimento médico geral
   que o outro agente pode ter "preenchido" sem base na conversa real.
2. Marque "grounded": true/false de acordo.
3. Ajuste a confiança ("audited_confidence") para baixo se a hipótese for
   pouco fundamentada na transcrição, mesmo que clinicamente plausível.
4. Escreva uma "audit_note" objetiva explicando o ajuste (ou confirmando que
   a hipótese está bem fundamentada).

Marque "needs_human_review": true se houver qualquer hipótese de risco
clínico relevante (ex. condição grave/urgente) sendo sugerida com pouca
fundamentação — isso é um aviso para o médico não confiar na sugestão sem
checar por conta própria, não uma reprovação da hipótese.

Seja rigoroso mas não pedante: o objetivo é reduzir alucinação e
overconfidence, não filtrar hipóteses razoáveis só por serem incertas — dados
insuficientes é uma nota válida, não motivo para marcar como não fundamentada
se a hipótese foi corretamente apresentada como incerta.

Responda SOMENTE com o objeto JSON abaixo, sem cercas de markdown (não use
\`\`\`), sem texto antes ou depois:
{
  "audited_hypotheses": [{ "condition": string, "grounded": boolean, "audited_confidence": "baixa"|"moderada"|"alta", "audit_note": string }],
  "needs_human_review": boolean,
  "overall_note": string
}`;

function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const label =
        s.speaker === 'doctor' ? 'Médico' : s.speaker === 'patient' ? 'Paciente' : 'Interlocutor';
      return `${label}: ${s.text}`;
    })
    .join('\n');
}

export async function runClinicalChallenger(
  segments: TranscriptSegment[],
  analysis: ClinicalAnalysis
): Promise<ChallengerReview> {
  if (analysis.hypotheses.length === 0) {
    // Nada para auditar — não vale gastar uma chamada de modelo.
    return { audited_hypotheses: [], needs_human_review: false, overall_note: '' };
  }

  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: CLINICAL_AGENT_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          'Transcrição da consulta até o momento:',
          formatTranscript(segments),
          '',
          'Hipóteses geradas pelo agente de análise (para auditoria):',
          JSON.stringify(analysis.hypotheses, null, 2),
        ].join('\n'),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Resposta do Clinical Challenger não contém texto.');
  }

  return ChallengerSchema.parse(parseModelJson(textBlock.text));
}

/**
 * NOTA PARA A PRÓXIMA ITERAÇÃO (não implementado aqui):
 * No DignosNeuro, o Clinical Challenger v2 separa a auditoria qualitativa do
 * LLM (o que este arquivo faz) do cálculo de score determinístico no backend
 * — evitando que o próprio modelo decida sozinho seu nível de confiança
 * final. Uma extensão natural aqui seria: transformar `grounded` +
 * `audited_confidence` em um rubric de pontos determinístico calculado em
 * TypeScript puro (sem chamada de modelo), e usar isso para decidir
 * `needs_human_review` em vez de confiar no campo que o próprio LLM marcou.
 */
