<<<<<<< HEAD
# AGENTE STAFF — MVP (Fase 1)

Scaffold inicial do assistente de IA para teleatendimentos médicos, implementando
a **Fase 1** do roadmap técnico (ver `plano-tecnico-roadmap.md` no projeto):
pipeline fim-a-fim **em lote, sem tempo real** — grava/sobe o áudio da consulta,
transcreve, roda o agente de análise clínica e gera o relatório final (SOAP).

Isso existe para validar a **qualidade das sugestões clínicas** antes de investir
na infraestrutura de streaming/tempo real e na janela flutuante (Fase 2).

## O que já está implementado

- Schema do Supabase (`supabase/schema.sql`): sessões, segmentos de transcrição,
  análises do agente e relatório final — com RLS por médico.
- Camada de transcrição plugável (`src/lib/transcription.ts`): interface
  `TranscriptionProvider` com um provider para um serviço Whisper self-hosted
  (via HTTP) e um provider mock para desenvolver sem STT no ar ainda.
- Cliente do SKB (`src/lib/skb.ts`): consome o `evidence.py` do projeto
  apoio-diagnostico/DignosNeuro como serviço HTTP compartilhado — decisão do
  plano técnico de não duplicar a base de conhecimento.
- Agente de análise clínica (`src/lib/agents/clinicalAnalysis.ts`): gera
  hipóteses diagnósticas, perguntas sugeridas e busca evidência no SKB.
- Agente de relatório final (`src/lib/agents/reportGenerator.ts`): gera o
  relatório em formato SOAP a partir da transcrição completa + histórico de
  análises da consulta.
- 4 rotas de API (`src/app/api/sessions/...`) que amarram o fluxo.
- UI mínima (`src/app/page.tsx`) só para operar/testar o pipeline manualmente
  — **não é a janela flutuante final do produto**, que é objetivo da Fase 2.

## O que falta para rodar de verdade

1. **Serviço de STT**: hoje sem `WHISPER_SERVICE_URL` configurado, a
   transcrição usa um provider mock. Falta subir um wrapper HTTP fino (ex.
   FastAPI) em cima de `faster-whisper` (+ `pyannote` para diarização) na sua
   VPS e apontar essa env var para ele.
2. **Serviço do SKB**: idem — falta expor `evidence.py` via HTTP
   (`GET /evidence/search?q=...`) para o agente citar evidência real.
3. **Auth real**: as rotas assumem um `doctorId` (uuid do Supabase Auth) já
   existente — não há tela de login neste scaffold.
4. **Rodar as migrações**: aplicar `supabase/schema.sql` num projeto novo, ou
   `supabase/migrations/002_clinical_challenger.sql` num projeto que já rodou
   a versão anterior do schema.

## Como rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher as variáveis
npm run dev
```

Abra `http://localhost:3000`, informe um `doctorId` válido (um usuário do seu
Supabase Auth), crie uma sessão, suba um arquivo de áudio, rode a análise e
gere o relatório.

## Fase 2 — extensão de navegador (primeira versão, já incluída)

A pasta `extension/` contém uma extensão de navegador (Manifest V3) que já
implementa a janela flutuante: captura o áudio da aba da teleconsulta, sobe
em chunks de ~15s para as mesmas rotas de API acima (agora com CORS
habilitado) e mostra hipóteses/perguntas atualizadas numa janela arrastável
sobre a página. Ver `extension/README.md` para como carregar e testar, e as
limitações conhecidas dessa primeira versão (sem diarização real, chunking
em vez de streaming de verdade, sem autenticação).

Isso resolve o caso de "teleatendimento dentro do navegador" (Meet, ou
qualquer página web). Para apps nativos fora do browser (Zoom/Teams
desktop), a rota é o app desktop com captura de áudio do sistema — discutido
na seção 4 do plano técnico e ainda não implementado.

## Fase 3 — Clinical Challenger (auditor adversarial, já incluída)

Antes de uma análise chegar à janela flutuante, `src/lib/agents/clinicalChallenger.ts`
audita cada hipótese gerada: verifica se ela está de fato apoiada por algo
dito na transcrição (não em conhecimento médico geral que o primeiro agente
"preencheu"), ajusta a confiança para baixo quando a fundamentação é fraca, e
marca `needs_human_review = true` quando uma hipótese de risco clínico
relevante está pouco fundamentada — um aviso explícito para o médico não
confiar cegamente na sugestão. Isso é a adaptação do componente Clinical
Challenger que você já usa no apoio-diagnostico/DignosNeuro, aqui numa
primeira versão só com auditoria qualitativa via LLM (o rubric de pontos
determinístico separado do LLM, como no DignosNeuro v2, fica para uma próxima
iteração — ver nota no final de `clinicalChallenger.ts`).

A extensão já mostra o resultado da auditoria na janela flutuante: confiança
ajustada, nota do auditor por hipótese, e um banner de alerta quando
`needs_human_review` é verdadeiro. Se o Challenger falhar (ex. erro de rede),
a análise principal não é bloqueada — só fica marcado explicitamente que a
auditoria não rodou, em vez de fingir que passou.

Aplicar `supabase/migrations/002_clinical_challenger.sql` para os novos
campos (`audited_hypotheses`, `challenger_note`, `needs_human_review`).

## Próximos passos do roadmap

Depois de validar a qualidade das hipóteses/relatórios auditadas com a
extensão em uso real: trocar o chunking por STT em streaming de verdade
(fila BullMQ/Redis + WebSocket/Supabase Realtime para push incremental,
eliminando os ~15s de latência por ciclo), adicionar diarização
médico/paciente, transformar o rubric do Challenger em cálculo determinístico
no backend, ampliar a cobertura do SKB, e decidir se vale a pena também um
app desktop para cobrir teleatendimentos fora do navegador (Fase 4: piloto
real com Dra. Sinara).
=======
# AGE-NT-STAFF
>>>>>>> 448e5b5d52f4a5b043a3e570611de1ab9724730d
