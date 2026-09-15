/**
 * Camada de transcrição — Fase 1 (em lote, sem streaming).
 *
 * A ideia é isolar o provider por trás de uma interface simples para que,
 * na Fase 2 (tempo real), a troca para streaming não exija reescrever quem
 * consome a transcrição — só trocar a implementação de `TranscriptionProvider`.
 *
 * Provider default: chama um serviço Whisper self-hosted (ex. faster-whisper
 * rodando na sua VPS, exposto via HTTP) para manter o áudio de saúde on-prem.
 * Configurar via WHISPER_SERVICE_URL. Sem essa env var, cai num provider mock
 * (útil para rodar o pipeline localmente sem infra de STT ainda no ar).
 */

export type TranscriptSegment = {
  speaker: 'doctor' | 'patient' | 'unknown';
  startMs: number;
  endMs: number;
  text: string;
};

export interface TranscriptionProvider {
  transcribe(audio: {
    buffer: Buffer;
    mimeType: string;
  }): Promise<TranscriptSegment[]>;
}

class WhisperServiceProvider implements TranscriptionProvider {
  constructor(private readonly serviceUrl: string) {}

  async transcribe(audio: {
    buffer: Buffer;
    mimeType: string;
  }): Promise<TranscriptSegment[]> {
    // Contrato esperado do serviço self-hosted (ex. wrapper em Python/FastAPI
    // em cima de faster-whisper + pyannote para diarização):
    //   POST /transcribe  (multipart/form-data, campo "audio")
    //   -> 200 { segments: [{ speaker, start_ms, end_ms, text }] }
    const form = new FormData();
    const bytes = new Uint8Array(audio.buffer);
    form.append(
      'audio',
      new Blob([bytes], { type: audio.mimeType }),
      'session-audio'
    );

    const res = await fetch(`${this.serviceUrl}/transcribe`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      throw new Error(
        `Falha no serviço de transcrição (${res.status}): ${await res.text()}`
      );
    }

    const data = (await res.json()) as {
      segments: Array<{
        speaker?: string;
        start_ms: number;
        end_ms: number;
        text: string;
      }>;
    };

    return data.segments.map((s) => ({
      speaker: (s.speaker as TranscriptSegment['speaker']) ?? 'unknown',
      startMs: s.start_ms,
      endMs: s.end_ms,
      text: s.text,
    }));
  }
}

/**
 * Provider mock — devolve um único segmento marcando que a transcrição real
 * ainda não está conectada. Só para permitir exercitar o resto do pipeline
 * (análise + relatório) antes do serviço de STT estar no ar.
 */
class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(): Promise<TranscriptSegment[]> {
    return [
      {
        speaker: 'unknown',
        startMs: 0,
        endMs: 0,
        text:
          '[TRANSCRIÇÃO MOCK — configure WHISPER_SERVICE_URL para conectar o ' +
          'serviço real de transcrição. Este texto é um placeholder.]',
      },
    ];
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  const url = process.env.WHISPER_SERVICE_URL;
  return url ? new WhisperServiceProvider(url) : new MockTranscriptionProvider();
}
