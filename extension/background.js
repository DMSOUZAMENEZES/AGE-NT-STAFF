/**
 * Service worker de background — orquestra o ciclo de vida da sessão:
 * cria a sessão no backend, prepara o offscreen document para captura de
 * áudio, encaminha atualizações de análise para o overlay na página, e
 * fecha a sessão gerando o relatório final.
 */

const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Captura e envia áudio do teleatendimento para transcrição.',
  });
}

async function broadcastToActiveTab(message) {
  const state = await chrome.storage.local.get(['activeTabId']);
  if (!state.activeTabId) return;
  chrome.tabs.sendMessage(state.activeTabId, message).catch(() => {
    // A aba pode não ter o content script pronto ainda — sem problema, a
    // próxima atualização de análise tenta de novo.
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_SESSION') {
    handleStart(message).then(sendResponse);
    return true;
  }

  if (message.type === 'STOP_SESSION') {
    handleStop().then(sendResponse);
    return true;
  }

  // Repassa atualizações vindas do offscreen document para o overlay da página.
  if (message.type === 'ANALYSIS_UPDATE' || message.type === 'CAPTURE_ERROR') {
    broadcastToActiveTab(message);
  }
});

async function handleStart({ backendUrl, doctorId, tabId }) {
  try {
    const res = await fetch(`${backendUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao criar sessão.');

    const sessionId = data.session.id;

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    await ensureOffscreenDocument();

    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'OFFSCREEN_START',
      streamId,
      backendUrl,
      sessionId,
    });

    await chrome.storage.local.set({
      activeSessionId: sessionId,
      activeTabId: tabId,
      backendUrl,
    });

    await broadcastToActiveTab({
      type: 'SESSION_STARTED',
      sessionId,
      backendUrl,
    });

    return { sessionId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleStop() {
  try {
    const state = await chrome.storage.local.get(['activeSessionId', 'backendUrl']);
    if (!state.activeSessionId) {
      return { error: 'Nenhum atendimento em andamento.' };
    }

    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' });

    const res = await fetch(
      `${state.backendUrl}/api/sessions/${state.activeSessionId}/report`,
      { method: 'POST' }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao gerar relatório.');

    await broadcastToActiveTab({ type: 'SESSION_ENDED', report: data.report });
    await chrome.storage.local.remove(['activeSessionId', 'activeTabId']);

    return { report: data.report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
