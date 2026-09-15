import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { generateSoapReport } from '@/lib/agents/reportGenerator';
import type { TranscriptSegment } from '@/lib/transcription';
import type { ClinicalAnalysis } from '@/lib/agents/clinicalAnalysis';
import { corsJson, corsPreflight } from '@/lib/http';

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/sessions/:id/report
 * Encerra a sessão: gera o relatório SOAP final a partir da transcrição
 * completa + todas as análises feitas ao longo da consulta, e disponibiliza
 * a transcrição literal junto.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  const supabase = getSupabaseServiceClient();

  const [{ data: segmentRows, error: segError }, { data: analysisRows, error: anaError }] =
    await Promise.all([
      supabase
        .from('transcript_segments')
        .select('speaker, start_ms, end_ms, text, sequence')
        .eq('session_id', sessionId)
        .order('sequence', { ascending: true }),
      supabase
        .from('case_analyses')
        .select('hypotheses, suggested_questions, cited_evidence')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]);

  if (segError) return corsJson({ error: segError.message }, { status: 500 });
  if (anaError) return corsJson({ error: anaError.message }, { status: 500 });

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

  const analyses = (analysisRows ?? []) as unknown as ClinicalAnalysis[];

  let report;
  try {
    report = await generateSoapReport(segments, analyses);
  } catch (err) {
    return corsJson(
      { error: `Falha no agente de relatório: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  const fullTranscript = segments
    .map((s) => {
      const label =
        s.speaker === 'doctor' ? 'Médico' : s.speaker === 'patient' ? 'Paciente' : '—';
      return `[${label}] ${s.text}`;
    })
    .join('\n');

  const allHypotheses = analyses.flatMap((a) => a.hypotheses ?? []);

  const { data: saved, error: insertError } = await supabase
    .from('case_reports')
    .upsert(
      {
        session_id: sessionId,
        format: 'soap',
        subjective: report.subjective,
        objective: report.objective,
        assessment: report.assessment,
        plan: report.plan,
        full_transcript: fullTranscript,
        summary_of_hypotheses: allHypotheses,
      },
      { onConflict: 'session_id' }
    )
    .select()
    .single();

  if (insertError) {
    return corsJson({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from('sessions')
    .update({ status: 'ready', ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  return corsJson({ report: saved });
}
