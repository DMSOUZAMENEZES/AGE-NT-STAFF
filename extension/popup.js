const backendUrlInput = document.getElementById('backendUrl');
const doctorIdInput = document.getElementById('doctorId');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function init() {
  const stored = await chrome.storage.local.get([
    'backendUrl',
    'doctorId',
    'activeSessionId',
  ]);
  backendUrlInput.value = stored.backendUrl || 'http://localhost:3000';
  doctorIdInput.value = stored.doctorId || '';

  if (stored.activeSessionId) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    setStatus(`Atendimento em andamento.\nSessão: ${stored.activeSessionId}`);
  }
}

startBtn.addEventListener('click', async () => {
  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');
  const doctorId = doctorIdInput.value.trim();

  if (!backendUrl || !doctorId) {
    setStatus('Preencha a URL do backend e o ID do médico.');
    return;
  }

  await chrome.storage.local.set({ backendUrl, doctorId });
  setStatus('Iniciando captura de áudio da aba...');

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    setStatus('Não foi possível identificar a aba ativa.');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'START_SESSION',
    backendUrl,
    doctorId,
    tabId: activeTab.id,
  });

  if (response?.error) {
    setStatus(`Erro: ${response.error}`);
    return;
  }

  startBtn.style.display = 'none';
  stopBtn.style.display = 'block';
  setStatus(`Atendimento iniciado.\nSessão: ${response.sessionId}`);
});

stopBtn.addEventListener('click', async () => {
  setStatus('Encerrando e gerando relatório final...');
  const response = await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });

  if (response?.error) {
    setStatus(`Erro ao gerar relatório: ${response.error}`);
    return;
  }

  startBtn.style.display = 'block';
  stopBtn.style.display = 'none';
  setStatus('Relatório gerado. Veja a transcrição e o SOAP na janela flutuante.');
});

init();
