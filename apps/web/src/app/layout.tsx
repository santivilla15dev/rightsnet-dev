import type { Metadata } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';
import { SessionProvider } from '@/components/session';
import { Shell } from '@/components/shell';
import './globals.css';

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RightsNet — Tu identidad. Tus reglas.',
  description:
    'Descubre talento y prueba el recorrido de licencias de likeness para publicidad con IA.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
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
