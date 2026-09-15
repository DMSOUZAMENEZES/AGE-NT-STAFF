import type { ReactNode } from 'react';

export const metadata = {
  title: 'AGENTE STAFF — MVP',
  description: 'Assistente de IA para teleatendimentos médicos (Fase 1)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
