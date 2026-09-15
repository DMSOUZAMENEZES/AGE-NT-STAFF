-- AGENTE STAFF — schema inicial (Fase 1: MVP em lote)
-- Rodar via Supabase SQL editor ou `supabase db push`.

create extension if not exists "pgcrypto";

-- Uma sessão = um atendimento/teleconsulta
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users (id),
  patient_label text, -- identificador não-sensível (evitar PII em texto livre aqui)
  status text not null default 'recording'
    check (status in ('recording', 'transcribing', 'analyzing', 'ready', 'error')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  audio_storage_path text, -- caminho no Supabase Storage (bucket 'session-audio')
  created_at timestamptz not null default now()
);

-- Segmentos de transcrição diarizada (médico/paciente/indefinido)
create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  speaker text not null default 'unknown' check (speaker in ('doctor', 'patient', 'unknown')),
  start_ms integer not null,
  end_ms integer not null,
  text text not null,
  sequence integer not null, -- ordem dentro da sessão
  created_at timestamptz not null default now()
);

create index if not exists idx_transcript_segments_session
  on transcript_segments (session_id, sequence);

-- Saídas do agente de análise clínica (hipóteses, perguntas, evidências citadas)
create table if not exists case_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  -- até que ponto da transcrição (sequence) esta análise considerou
  transcript_cutoff_sequence integer not null,
  hypotheses jsonb not null default '[]', -- [{ condition, rationale, confidence }]
  suggested_questions jsonb not null default '[]', -- [{ question, rationale }]
  cited_evidence jsonb not null default '[]', -- [{ source, title, excerpt, url_or_ref }]
  raw_model_output jsonb, -- payload bruto do agente, para auditoria
  -- Saída do Clinical Challenger (auditor adversarial, Fase 3) — ver migração 002.
  audited_hypotheses jsonb not null default '[]',
  challenger_note text,
  needs_human_review boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_case_analyses_needs_review
  on case_analyses (session_id)
  where needs_human_review = true;

create index if not exists idx_case_analyses_session
  on case_analyses (session_id, created_at desc);

-- Relatório final da consulta (gerado ao encerrar a sessão)
create table if not exists case_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions (id) on delete cascade,
  format text not null default 'soap' check (format in ('soap', 'free_text')),
  subjective text,
  objective text,
  assessment text,
  plan text,
  full_transcript text not null, -- transcrição literal concatenada
  summary_of_hypotheses jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- RLS: cada médico só acessa suas próprias sessões e dados derivados
alter table sessions enable row level security;
alter table transcript_segments enable row level security;
alter table case_analyses enable row level security;
alter table case_reports enable row level security;

create policy "doctor manages own sessions" on sessions
  for all using (auth.uid() = doctor_id) with check (auth.uid() = doctor_id);

create policy "doctor reads own transcript segments" on transcript_segments
  for all using (
    exists (select 1 from sessions s where s.id = session_id and s.doctor_id = auth.uid())
  );

create policy "doctor reads own analyses" on case_analyses
  for all using (
    exists (select 1 from sessions s where s.id = session_id and s.doctor_id = auth.uid())
  );

create policy "doctor reads own reports" on case_reports
  for all using (
    exists (select 1 from sessions s where s.id = session_id and s.doctor_id = auth.uid())
  );
