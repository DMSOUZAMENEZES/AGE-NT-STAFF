/**
 * Offscreen document — único lugar onde dá pra usar getUserMedia/MediaRecorder
 * em uma extensão MV3 (o service worker de background não tem acesso a
 * essas APIs). Recebe o streamId de tabCapture, grava em ciclos e sobe cada
 * ciclo para o backend.
 *
 * Estratégia de chunking: em vez de usar o parâmetro `timeslice` do
 * MediaRecorder (que gera fragmentos webm sem cabeçalho, não decodificáveis
 * isoladamente pelo Whisper), reinicia um MediaRecorder novo a cada ciclo —
 * cada blob resultante é um arquivo webm válido e autocontido.
 */

let capturing = false;
let currentStream = null;
let audioContext = null;

const CHUNK_MS = 15000; // ~15s por chunk — trade-off entre latência e custo/qualidade de STT

async function startCapture({ streamId, backendUrl, sessionId }) {
  capturing = true;

  currentStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Sem isso, capturar o áudio da aba interrompe a saída de som para quem
  // está na chamada — precisamos reencaminhar o stream para os alto-falantes.
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(currentStream);
  source.connect(audioContext.destination);

  runChunkCycle(backendUrl, sessionId);
}

function runChunkCycle(backendUrl, sessionId) {
  if (!capturing || !currentStream) return;

  const recorder = new MediaRecorder(currentStream, {
    mimeType: 'audio/webm;codecs=opus',
  });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    if (blob.size > 0) {
      await uploadAndAnalyze(blob, backendUrl, sessionId);
    }
    if (capturing) runChunkCycle(backendUrl, sessionId);
  };

  recorder.start();
  setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, CHUNK_MS);
}

async function uploadAndAnalyze(blob, backendUrl, sessionId) {
  try {
    const form = new FormData();
    form.append('audio', blob, 'chunk.webm');

    const audioRes = await fetch(`${backendUrl}/api/sessions/${sessionId}/audio`, {
      method: 'POST',
      body: form,
    });

    if (!audioRes.ok) {
      throw new Error(`upload falhou (${audioRes.status})`);
    }

    // Dispara uma nova passada de análise sobre a transcrição acumulada.
    const analyzeRes = await fetch(`${backendUrl}/api/sessions/${sessionId}/analyze`, {
      method: 'POST',
    });
    const analyzeData = await analyzeRes.json();

    if (!analyzeRes.ok) {
      throw new Error(analyzeData.error || `análise falhou (${analyzeRes.status})`);
    }

    chrome.runtime.sendMessage({
      type: 'ANALYSIS_UPDATE',
      analysis: analyzeData.analysis,
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function stopCapture() {
  capturing = false;
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'OFFSCREEN_START') {
    startCapture(message).then(() => sendResponse({ ok: true }));
    return true; // resposta assíncrona
  }

  if (message.type === 'OFFSCREEN_STOP') {
    stopCapture();
    sendResponse({ ok: true });
  }
});
