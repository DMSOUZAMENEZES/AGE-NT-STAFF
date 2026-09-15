'use client';

import { useState } from 'react';

/**
 * UI mínima de operação do MVP (Fase 1) — não é a "janela flutuante" final
 * do produto (essa é o objetivo da Fase 2, como extensão ou app desktop).
 * Serve para exercitar o pipeline completo: criar sessão -> subir áudio ->
 * disparar análise -> gerar relatório final.
 */
export default function Home() {
  const [doctorId, setDoctorId] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<unknown>(null);
  const [report, setReport] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function appendLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function createSession() {
    setBusy(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessionId(data.session.id);
      appendLog(`Sessão criada: ${data.session.id}`);
    } catch (err) {
      appendLog(`Erro ao criar sessão: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAudio(file: File) {
    if (!sessionId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch(`/api/sessions/${sessionId}/audio`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      appendLog(`Transcrição concluída: ${data.segmentsInserted} segmento(s).`);
    } catch (err) {
      appendLog(`Erro na transcrição: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
      appendLog('Análise clínica gerada.');
    } catch (err) {
      appendLog(`Erro na análise: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function generateReport() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/report`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(data.report);
      appendLog('Relatório final gerado.');
    } catch (err) {
      appendLog(`Erro no relatório: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>AGENTE STAFF — MVP (Fase 1)</h1>
      <p style={{ color: '#555' }}>
        Fluxo em lote: criar sessão → subir áudio da consulta → rodar análise
        clínica → gerar relatório final. Sem tempo real ainda (Fase 2).
      </p>

      <section style={{ marginTop: 24 }}>
        <h2>1. Sessão</h2>
        <input
          placeholder="doctorId (uuid do médico no Supabase Auth)"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button disabled={busy || !doctorId} onClick={createSession}>
          Criar sessão
        </button>
        {sessionId && <p>Sessão atual: {sessionId}</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>2. Áudio da consulta</h2>
        <input
          type="file"
          accept="audio/*"
          disabled={busy || !sessionId}
          onChange={(e) => e.target.files?.[0] && uploadAudio(e.target.files[0])}
        />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>3. Análise clínica</h2>
        <button disabled={busy || !sessionId} onClick={runAnalysis}>
          Rodar análise
        </button>
        {analysis !== null && (
          <pre style={{ background: '#f5f5f5', padding: 12, overflowX: 'auto' }}>
            {JSON.stringify(analysis, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>4. Relatório final</h2>
        <button disabled={busy || !sessionId} onClick={generateReport}>
          Gerar relatório
        </button>
        {report !== null && (
          <pre style={{ background: '#f5f5f5', padding: 12, overflowX: 'auto' }}>
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Log</h2>
        <ul>
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
