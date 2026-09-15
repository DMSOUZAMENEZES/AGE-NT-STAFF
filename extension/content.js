/**
 * Content script — injeta a janela flutuante (overlay) que o médico
 * posiciona livremente sobre a página do teleatendimento. Fica invisível até
 * a extensão avisar que uma sessão começou (mensagem SESSION_STARTED).
 */

let panelEls = null;

function buildOverlay() {
  const host = document.createElement('div');
  host.id = 'agente-staff-overlay-host';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('overlay.css');
  shadow.appendChild(link);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="header" id="drag-handle">
      <span class="title"><span class="status-dot" id="status-dot"></span>AGENTE STAFF</span>
      <button class="close-btn" id="close-btn" title="Ocultar">✕</button>
    </div>
    <div class="body" id="body-content">
      <div class="empty">Aguardando início do atendimento...</div>
    </div>
    <div class="footer-note">Apoio à decisão — não substitui o julgamento clínico.</div>
  `;
  shadow.appendChild(panel);

  makeDraggable(panel, shadow.getElementById('drag-handle'));

  shadow.getElementById('close-btn').addEventListener('click', () => {
    host.style.display = 'none';
  });

  return { host, shadow, panel, body: shadow.getElementById('body-content'), statusDot: shadow.getElementById('status-dot') };
}

function makeDraggable(panel, handle) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    panel.style.right = 'auto';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });
}

function ensureOverlay() {
  if (!panelEls) panelEls = buildOverlay();
  panelEls.host.style.display = 'block';
  return panelEls;
}

function confidenceLabel(c) {
  return c || 'baixa';
}

function renderAnalysis(analysis) {
  const { body, statusDot } = ensureOverlay();
  statusDot.classList.add('live');

  if (!analysis) {
    body.innerHTML = '<div class="empty">Nenhuma análise ainda — aguardando transcrição.</div>';
    return;
  }

  const hypotheses = analysis.hypotheses || [];
  const questions = analysis.suggested_questions || [];
  const audited = analysis.audited_hypotheses || [];

  // O Clinical Challenger (Fase 3) audita cada hipótese depois de gerada —
  // cruzamos pelo nome da condição para mostrar a confiança já ajustada e a
  // nota de auditoria, em vez da confiança original "crua" do primeiro agente.
  const auditByCondition = new Map(audited.map((a) => [a.condition, a]));

  const reviewBanner = analysis.needs_human_review
    ? `<div class="item" style="background:#fef2f2;border:1px solid #fecaca;">
         ⚠ <strong>Revisar com atenção</strong> — o auditor sinalizou hipótese(s)
         de risco clínico com fundamentação fraca na transcrição.
       </div>`
    : '';

  const hypothesesHtml = hypotheses.length
    ? hypotheses
        .map((h) => {
          const audit = auditByCondition.get(h.condition);
          const confidence = confidenceLabel(audit?.audited_confidence || h.confidence);
          const groundedNote =
            audit && !audit.grounded
              ? `<div class="rationale">⚠ auditor: fundamentação fraca na transcrição — ${escapeHtml(audit.audit_note || '')}</div>`
              : audit
                ? `<div class="rationale">✓ auditado: ${escapeHtml(audit.audit_note || '')}</div>`
                : '';
          return `
        <div class="item">
          <strong>${escapeHtml(h.condition)}</strong>
          <span class="confidence ${confidence}">${confidence}</span>
          <div class="rationale">${escapeHtml(h.rationale || '')}</div>
          ${groundedNote}
        </div>`;
        })
        .join('')
    : '<div class="empty">Sem hipóteses ainda.</div>';

  const questionsHtml = questions.length
    ? questions
        .map(
          (q) => `
        <div class="item">
          ${escapeHtml(q.question)}
          <div class="rationale">${escapeHtml(q.rationale || '')}</div>
        </div>`
        )
        .join('')
    : '<div class="empty">Sem perguntas sugeridas ainda.</div>';

  body.innerHTML = `
    ${reviewBanner}
    <div class="section-title">Hipóteses (auditadas)</div>
    ${hypothesesHtml}
    <div class="section-title">Perguntas sugeridas</div>
    ${questionsHtml}
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SESSION_STARTED') {
    const { body, statusDot } = ensureOverlay();
    statusDot.classList.remove('live');
    body.innerHTML = '<div class="empty">Sessão iniciada — transcrevendo...</div>';
  }

  if (message.type === 'ANALYSIS_UPDATE') {
    renderAnalysis(message.analysis);
  }

  if (message.type === 'CAPTURE_ERROR') {
    const { body, statusDot } = ensureOverlay();
    statusDot.classList.remove('live');
    body.innerHTML = `<div class="empty">Erro: ${escapeHtml(message.error)}</div>`;
  }

  if (message.type === 'SESSION_ENDED') {
    const { body, statusDot } = ensureOverlay();
    statusDot.classList.remove('live');
    const r = message.report || {};
    body.innerHTML = `
      <div class="section-title">Consulta encerrada</div>
      <div class="item"><strong>Avaliação</strong><div class="rationale">${escapeHtml(r.assessment || '')}</div></div>
      <div class="item"><strong>Plano</strong><div class="rationale">${escapeHtml(r.plan || '')}</div></div>
      <div class="empty">Relatório completo (SOAP + transcrição) salvo no backend.</div>
    `;
  }
});
