# AGENTE STAFF — Extensão (Fase 2, primeira versão)

Extensão de navegador (Manifest V3) que captura o áudio da aba do
teleatendimento, envia para o backend em chunks de ~15s, e mostra hipóteses
diagnósticas e perguntas sugeridas numa janela flutuante e arrastável
sobreposta à página.

**Importante — o que isso é e o que não é:** isso é "quase tempo real" via
chunking periódico (15s), não streaming de verdade. É a ponte entre a Fase 1
(lote manual) e uma Fase 2 completa com STT em streaming — permite usar a
janela flutuante já, sem esperar a infraestrutura de streaming ficar pronta.
Trocar por streaming de verdade depois não deve exigir mudar a extensão,
só o provider de transcrição no backend (`WHISPER_SERVICE_URL`) e o
intervalo `CHUNK_MS` em `offscreen.js`.

## Como funciona

1. O médico clica no ícone da extensão, informa a URL do backend e seu
   `doctorId`, e clica em "Iniciar atendimento" **na aba onde a chamada está
   rodando** (Google Meet, ou qualquer página web com áudio).
2. A extensão captura o áudio da aba (`chrome.tabCapture`) via um
   *offscreen document* (necessário em MV3 — o service worker de background
   não tem acesso a `getUserMedia`/`MediaRecorder`).
3. A cada ~15s, o áudio gravado é enviado para
   `POST /api/sessions/:id/audio` (transcreve e acumula os segmentos) e em
   seguida `POST /api/sessions/:id/analyze` é disparado (nova passada de
   hipóteses/perguntas). O resultado aparece na janela flutuante.
4. Ao clicar em "Encerrar", chama `POST /api/sessions/:id/report` e mostra
   um resumo do relatório final na janela.

## Limitações conhecidas desta primeira versão

- **Sem diarização real ainda**: os segmentos vêm como `speaker: "unknown"`
  a menos que o serviço Whisper configurado já faça diarização médico/
  paciente. Sem isso, o agente de análise perde uma informação importante.
- **Pequenos gaps de áudio entre chunks**: a estratégia de reiniciar o
  `MediaRecorder` a cada ciclo (em vez de usar `timeslice`) garante chunks
  webm válidos e decodificáveis, mas cria uma lacuna de alguns milissegundos
  entre um chunk e o próximo.
- **CORS aberto** (`Access-Control-Allow-Origin: *`) no backend para
  simplificar o MVP — apertar isso antes de qualquer uso com dados reais de
  paciente.
- **Sem autenticação de usuário na extensão**: `doctorId` é digitado
  manualmente no popup; não há login. Antes de uso real, isso precisa vir de
  uma sessão autenticada de verdade.
- Só funciona para teleatendimentos que rodam **dentro de uma aba do
  navegador**. Se o médico usa Zoom/Teams como app nativo (fora do browser),
  esta extensão não captura esse áudio — nesse caso a rota é o app desktop
  discutido no plano técnico (seção 4).

## Como testar localmente

1. Suba o backend (`npm run dev` na raiz do projeto, com `.env.local`
   preenchido — mesmo com `WHISPER_SERVICE_URL` vazio ele usa o provider
   mock, então dá pra testar o fluxo de UI sem STT real ainda).
2. Em `chrome://extensions`, ative o "Modo do desenvolvedor" e clique em
   "Carregar sem compactação", apontando para esta pasta (`extension/`).
3. Abra qualquer aba com áudio tocando, clique no ícone da extensão,
   informe `http://localhost:3000` e um `doctorId` (uuid de um usuário real
   do seu Supabase Auth — a rota `/api/sessions` exige um `doctor_id` válido
   por causa da foreign key), e clique em "Iniciar atendimento".
4. A cada ~15s, um chunk deve ser transcrito (texto mock, se
   `WHISPER_SERVICE_URL` não estiver configurado) e a janela flutuante deve
   atualizar.
