import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { corsJson, corsPreflight } from '@/lib/http';

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/sessions
 * Cria uma nova sessão de atendimento. body: { doctorId, patientLabel? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { doctorId, patientLabel } = body as {
    doctorId?: string;
    patientLabel?: string;
  };

  if (!doctorId) {
    return corsJson({ error: 'doctorId é obrigatório' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('sessions')
    .insert({ doctor_id: doctorId, patient_label: patientLabel ?? null })
    .select()
    .single();

  if (error) {
    return corsJson({ error: error.message }, { status: 500 });
  }

  return corsJson({ session: data }, { status: 201 });
}
