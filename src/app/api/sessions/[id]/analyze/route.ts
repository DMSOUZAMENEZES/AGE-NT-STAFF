import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { runClinicalAnalysis } from '@/lib/agents/clinicalAnalysis';
import { runClinicalChallenger, type ChallengerReview } from '@/lib/agents/clinicalChallenger';
import type { TranscriptSegment } from '@/lib/transcription';
import { corsJson, corsPreflight } from '@/lib/http';

export function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/sessions/:id/analyze
 * Retorna a análise mais recente da sessão — usado pela janela flutuante
 * (extensão) para fazer polling e mostrar hipóteses/perguntas atualizadas.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('case_analyses')
    .select('*')
    .eq('session_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return corsJson({ error: error.message }, { status: 500 });
  }

  return corsJson({ analysis: data ?? null });
}

/**
 * POST /api/sessions/:id/analyze
 * Roda o agente de análise clínica sobre toda a transcrição acumulada até
 * agora e salva o resultado. Na Fase 1 o médico dispara isso manualmente;
 * na Fase 2 a extensão dispara isso periodicamente (gatilho por tempo),
 * enquanto uma cadência mais inteligente (pausa/fim de frase) não substitui
 * o gatilho por tempo como fallback.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  const supabase = getSupabaseServiceClient();

  const { data: segmentRows, error: segError } = await supabase
    .from('transcript_segments')
    .select('speaker, start_ms, end_ms, text, sequence')
    .eq('session_id', sessionId)
    .order('sequence', { ascending: true });

  if (segError) {
    return corsJson({ error: segError.message }, { status: 500 });
  }

  if (!segmentRows || segmentRows.length === 0) {
    return corsJson(
      { error: 'Nenhum segmento de transcrição encontrado para esta sessão.' },
      { status: 400 }
    );
  }

  const segments: TranscriptSegment[] = segmentRows.map((r) => ({
    speaker: r.speaker as TranscriptSegment['speaker'],
    startMs: r.start_ms,
    endMs: r.end_ms,
    text: r.text,
  }));

  let analysis;
  try {
    analysis = await runClinicalAnalysis(segments);
  } catch (err) {
    return corsJson(
      { error: `Falha no agente de análise: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  const maxSequence = segmentRows[segmentRows.length - 1].sequence;

  // Fase 3: audita as hipóteses antes de salvar/expor à janela flutuante.
  // Se o Challenger falhar por algum motivo, não bloqueia a análise
  // principal — só marca explicitamente que a auditoria não rodou, em vez
  // de fingir que passou por auditoria.
  let challengerReview: ChallengerReview;
  try {
    challengerReview = await runClinicalChallenger(segments, analysis);
  } catch (err) {
    challengerReview = {
      audited_hypotheses: [],
      needs_human_review: false,
      overall_note: `Auditoria (Clinical Challenger) indisponível: ${(err as Error).message}`,
    };
  }

  const { data: saved, error: insertError } = await supabase
    .from('case_analyses')
    .insert({
      session_id: sessionId,
      transcript_cutoff_sequence: maxSequence,
      hypotheses: analysis.hypotheses,
      suggested_questions: analysis.suggested_questions,
      cited_evidence: analysis.citedEvidence,
      raw_model_output: analysis,
      audited_hypotheses: challengerReview.audited_hypotheses,
      challenger_note: challengerReview.overall_note,
      needs_human_review: challengerReview.needs_human_review,
    })
    .select()
    .single();

  if (insertError) {
    return corsJson({ error: insertError.message }, { status: 500 });
  }

  return corsJson({ analysis: saved });
}
