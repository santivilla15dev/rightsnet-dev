'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { api, date, labels } from '@/lib/api';
import type { Verification } from '@/lib/types';
import { Button } from './ui/button';
import { Loading, ErrorPanel, Title, Badge, SandboxNote } from './common';
export function Verify({ token }: { token: string }) {
  const [data, setData] = useState<Verification | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(await api<Verification>('public/licenses/' + token + '/verify'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  if (error) return <ErrorPanel message={error} retry={() => void load()} />;
  if (!data) return <Loading />;
  return (
    <>
      <Title
        eyebrow="VERIFICACIÓN PÚBLICA"
        title="Un permiso que puedes comprobar."
        description="Integridad del certificado y estado actual de la licencia de prueba."
      />
      <article className="verification-card">
        <div className="certificate-top">
          <span className="certificate-mark">
            <ShieldCheck size={40} />
          </span>
          <div>
            <span className="eyebrow">RIGHTSNET · DIGITAL LIKENESS</span>
            <h2>Certificado de licencia</h2>
          </div>
          <Badge value={data.status} />
        </div>
        <div className="certificate-ribbon">
          <CheckCircle2 size={19} />
          {data.signature_valid ? 'Firma criptográfica verificada' : 'Firma no válida'}
          <span>Ed25519 · {data.key_id}</span>
        </div>
        <div className="certificate-content">
          <div>
            <span className="eyebrow">CAMPAÑA</span>
            <h3>{data.scope.campaign_name}</h3>
            <p>Permiso no exclusivo para publicidad con contenido sintético.</p>
          </div>
          <dl className="certificate-details">
            <div>
              <dt>Licencia</dt>
              <dd>
                <code>{data.license_id}</code>
              </dd>
            </div>
            <div>
              <dt>Contenido</dt>
              <dd>{labels[data.scope.operation ?? data.scope.generation_type ?? ''] ?? '—'}</dd>
            </div>
            <div>
              <dt>Vigencia UTC</dt>
              <dd>
                {date(data.starts_at)} — {date(data.ends_at)}
              </dd>
            </div>
            <div>
              <dt>Territorios</dt>
              <dd>{data.scope.territories.join(' · ')}</dd>
            </div>
            <div>
              <dt>Canales</dt>
              <dd>{data.scope.channels.join(' · ')}</dd>
            </div>
            <div>
              <dt>Restricciones</dt>
              <dd>Sin voz, entrenamiento ni sublicencias</dd>
            </div>
          </dl>
        </div>
        <div className="certificate-bottom">
          <p>
            Consultado: {new Date(data.checked_at).toLocaleString('es-ES')}
            <br />
            <span>La firma acredita integridad y emisor; no garantiza titularidad jurídica.</span>
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw size={15} />
            Comprobar ahora
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            <Download size={15} />
            Imprimir / PDF
          </Button>
        </div>
      </article>
      <SandboxNote />
    </>
  );
}
