'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, date, labels } from '@/lib/api';
import type { GenerationVerification } from '@/lib/types';
import { Button } from './ui/button';
import { Loading, ErrorPanel, Title, Badge, SandboxNote } from './common';

export function GenerationVerify({ token }: { token: string }) {
  const [data, setData] = useState<GenerationVerification | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(await api<GenerationVerification>('public/generations/' + token + '/verify'));
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
        title="Una generación que puedes comprobar."
        description="Constancia de que un output se reportó bajo una autorización RightsNet."
      />
      <article className="verification-card">
        <div className="certificate-top">
          <span className="certificate-mark">
            <ShieldCheck size={40} />
          </span>
          <div>
            <span className="eyebrow">RIGHTSNET · GENERATION RECORD</span>
            <h2>Registro de generación</h2>
          </div>
          <Badge value={data.status} />
        </div>
        <div className="certificate-ribbon">
          <CheckCircle2 size={19} />
          Reportado y vinculado a un RN-AUTH consumido
        </div>
        <div className="certificate-content">
          <dl className="certificate-details">
            <div>
              <dt>Identificador</dt>
              <dd>
                <code>{data.public_token}</code>
              </dd>
            </div>
            <div>
              <dt>Contenido</dt>
              <dd>{labels[data.content_type ?? ''] ?? data.content_type ?? '—'}</dd>
            </div>
            <div>
              <dt>Proveedor</dt>
              <dd>{data.provider}</dd>
            </div>
            <div>
              <dt>Reportado (UTC)</dt>
              <dd>{date(data.reported_at)}</dd>
            </div>
            {data.sha256 ? (
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code>{data.sha256}</code>
                </dd>
              </div>
            ) : null}
            {data.external_job_id ? (
              <div>
                <dt>Job externo</dt>
                <dd>
                  <code>{data.external_job_id}</code>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="certificate-bottom">
          <p>
            <span>No expone URLs privadas del partner ni firmas RN-AUTH.</span>
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw size={15} />
            Comprobar ahora
          </Button>
        </div>
      </article>
      <SandboxNote />
    </>
  );
}
