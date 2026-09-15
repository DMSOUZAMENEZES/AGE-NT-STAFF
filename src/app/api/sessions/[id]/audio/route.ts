import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { getTranscriptionProvider } from '@/lib/transcription';
import { corsJson, corsPreflight } from '@/lib/http';

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/sessions/:id/audio
 * Recebe um chunk de áudio (arquivo completo na Fase 1, ou um chunk de
 * ~15-30s enviado periodicamente pela extensão na Fase 2), transcreve via
 * provider configurado e ANEXA os novos segmentos aos já existentes da
 * sessão (em vez de substituir) — isso é o que permite a extensão ir
 * empurrando áudio em near-real-time sem esperar o fim da consulta.
 *
 * multipart/form-data com campo "audio".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  const form = await req.formData();
  const audioFile = form.get('audio');

  if (!(audioFile instanceof Blob)) {
    return corsJson({ error: 'Campo "audio" (arquivo) é obrigatório.' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return corsJson({ error: 'Sessão não encontrada.' }, { status: 404 });
  }

  await supabase
    .from('sessions')
    .update({ status: 'transcribing' })
    .eq('id', sessionId);

  const buffer = Buffer.from(await audioFile.arrayBuffer());
  const provider = getTranscriptionProvider();

  let segments;
  try {
    segments = await provider.transcribe({
      buffer,
      mimeType: audioFile.type || 'audio/webm',
    });
  } catch (err) {
    await supabase.from('sessions').update({ status: 'error' }).eq('id', sessionId);
    return corsJson(
      { error: `Falha na transcrição: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // Continua a numeração de sequence a partir do último segmento já salvo,
  // para que chunks sucessivos da mesma sessão se acumulem em ordem.
  const { data: lastSegment } = await supabase
    .from('transcript_segments')
    .select('sequence')
    .eq('session_id', sessionId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startSequence = (lastSegment?.sequence ?? -1) + 1;

  const rows = segments.map((s, i) => ({
    session_id: sessionId,
    speaker: s.speaker,
    start_ms: s.startMs,
    end_ms: s.endMs,
    text: s.text,
    sequence: startSequence + i,
  }));

  const { error: insertError } = await supabase
    .from('transcript_segments')
    .insert(rows);

  if (insertError) {
    return corsJson({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from('sessions')
    .update({ status: 'analyzing' })
    .eq('id', sessionId);

  return corsJson({ segmentsInserted: rows.length });
}
