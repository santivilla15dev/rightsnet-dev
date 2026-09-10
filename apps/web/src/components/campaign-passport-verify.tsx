'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, date } from '@/lib/api';
import { Button } from './ui/button';
import { Loading, ErrorPanel, Title, Badge, SandboxNote } from './common';

type PassportVerify = {
  token: string;
  status: string;
  evaluated_at: string;
  expires_at: string;
  campaign: { id: string; name: string };
  clearance: { status: string; score: number };
  preflight: { status: string };
  postflight: { status: string };
  talent_count: number;
  open_deal_requests: number;
  flags: { authority: boolean; media_verified: boolean; legal_clearance: boolean };
};

export function CampaignPassportVerify({ token }: { token: string }) {
  const [data, setData] = useState<PassportVerify | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(await api<PassportVerify>('public/campaign-passports/' + token));
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
        title="Campaign Passport"
        description="Resumen técnico de comprobaciones RightsNet. No constituye autorización legal ni permiso de uso."
      />
      <article className="verification-card">
        <div className="certificate-top">
          <span className="certificate-mark">
            <ShieldCheck size={40} />
          </span>
          <div>
            <span className="eyebrow">RIGHTSNET · CAMPAIGN PASSPORT</span>
            <h2>{data.campaign.name}</h2>
          </div>
          <Badge value={data.status} />
        </div>
        <p className="certificate-ribbon">
          Consulta del {date(data.evaluated_at)} · caduca {date(data.expires_at)}
        </p>
        <div className="certificate-content">
          <dl className="certificate-details">
            <div>
              <dt>Token</dt>
              <dd>{data.token}</dd>
            </div>
            <div>
              <dt>Clearance</dt>
              <dd>
                {data.clearance.status} · score {data.clearance.score}
              </dd>
            </div>
            <div>
              <dt>Preflight</dt>
              <dd>{data.preflight.status}</dd>
            </div>
            <div>
              <dt>Postflight</dt>
              <dd>{data.postflight.status}</dd>
            </div>
            <div>
              <dt>Talentos</dt>
              <dd>{data.talent_count}</dd>
            </div>
            <div>
              <dt>Solicitudes abiertas</dt>
              <dd>{data.open_deal_requests}</dd>
            </div>
            <div>
              <dt>Flags</dt>
              <dd>
                authority={String(data.flags.authority)} · media_verified=
                {String(data.flags.media_verified)} · legal_clearance=
                {String(data.flags.legal_clearance)}
              </dd>
            </div>
          </dl>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Actualizar evaluación
        </Button>
      </article>
      <SandboxNote />
    </>
  );
}
