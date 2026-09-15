import { NextResponse } from 'next/server';

/**
 * A extensão de navegador (Fase 2) chama esta API a partir do contexto da
 * extensão/da aba onde o teleatendimento acontece — habilitamos CORS aberto
 * nestas rotas para simplificar o MVP. Antes de produção real, restringir
 * `Access-Control-Allow-Origin` ao(s) ID(s) de extensão conhecidos.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function corsJson(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: CORS_HEADERS,
  });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
