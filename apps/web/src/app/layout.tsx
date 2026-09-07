import type { Metadata } from 'next';
import { SessionProvider } from '@/components/session';
import { Shell } from '@/components/shell';
import './globals.css';
export const metadata: Metadata = {
  title: 'RightsNet — Tu identidad. Tus reglas.',
  description:
    'Descubre talento y prueba el recorrido de licencias de likeness para publicidad con IA.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a href="#main" className="skip-link">
          Saltar al contenido
        </a>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
