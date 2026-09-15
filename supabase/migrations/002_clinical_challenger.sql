-- Fase 3 — Clinical Challenger: auditor adversarial que revisa as hipóteses
-- geradas antes de chegarem à janela flutuante, adaptando o componente já
-- usado no apoio-diagnostico/DignosNeuro para o contexto de sugestões em
-- tempo real.

alter table case_analyses
  add column if not exists audited_hypotheses jsonb not null default '[]',
  add column if not exists challenger_note text,
  add column if not exists needs_human_review boolean not null default false;

create index if not exists idx_case_analyses_needs_review
  on case_analyses (session_id)
  where needs_human_review = true;
