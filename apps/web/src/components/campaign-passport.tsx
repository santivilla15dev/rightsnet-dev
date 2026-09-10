'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { ErrorPanel, Loading } from './common';

type Passport = {
  id: string;
  public_token: string;
  status: string;
  allowlist: { type: string; value: string }[];
  label: string;
  expires_at: string;
  verify_path: string;
};
type Listing = { can_edit: boolean; items: Passport[] };

export function CampaignPassportPanel({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<Listing | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [email, setEmail] = useState(''),
    [label, setLabel] = useState(''),
    [copied, setCopied] = useState('');

  useEffect(() => {
    let ignore = false;
    setData(null);
    void api<Listing>(`campaigns/${id}/passports`)
      .then((r) => {
        if (!ignore) setData(r);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [id, refresh]);

  async function issue() {
    setBusy(true);
    setError('');
    try {
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      await api(`campaigns/${id}/passports`, {
        method: 'POST',
        body: {
          allowlist: [{ type: 'email', value: email.trim() }],
          expires_at: expires,
          label: label.trim(),
        },
      });
      setEmail('');
      setLabel('');
      await onChanged();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(passportId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`campaigns/${id}/passports/${passportId}/revoke`, {
        method: 'POST',
        body: {},
      });
      await onChanged();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(path: string, token: string) {
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
  }

  return (
    <section className="talent-workspace">
      <h2>Campaign Passport</h2>
      <p>
        Resumen técnico compartible. No constituye autorización legal ni permiso de uso. El enlace
        es un secreto de lectura: revócalo si se filtra.
      </p>
      {error ? <ErrorPanel message={error} /> : null}
      {!data && !error ? <Loading /> : null}
      {data?.can_edit ? (
        <form
          className="panel talent-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void issue();
          }}
        >
          <label>
            Destinatario (email en allowlist)
            <input
              className="input"
              type="email"
              required
              aria-label="Email allowlist passport"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Etiqueta (opcional)
            <input
              className="input"
              aria-label="Etiqueta passport"
              maxLength={80}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
            />
          </label>
          <p>Caduca en 7 días (máximo configurable vía API: 30).</p>
          <Button type="submit" disabled={busy || !email.trim()}>
            Emitir passport
          </Button>
        </form>
      ) : data ? (
        <p>Acceso de lectura.</p>
      ) : null}
      {data?.items.map((item) => (
        <article className="panel" key={item.id}>
          <h3>
            {item.public_token} · {item.status}
          </h3>
          {item.label ? <p>{item.label}</p> : null}
          <p>Caduca: {new Date(item.expires_at).toLocaleString('es-ES')}</p>
          <p>
            Allowlist:{' '}
            {item.allowlist.map((a) => `${a.type}:${a.value}`).join(', ') || '—'}
          </p>
          {item.status === 'ACTIVE' ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void copyLink(item.verify_path, item.public_token)}
              >
                {copied === item.public_token ? 'Enlace copiado' : 'Copiar enlace público'}
              </Button>
              {data.can_edit ? (
                <Button variant="outline" disabled={busy} onClick={() => void revoke(item.id)}>
                  Revocar
                </Button>
              ) : null}
            </>
          ) : null}
        </article>
      ))}
      {data && !data.items.length ? <p>Todavía no hay passports emitidos.</p> : null}
    </section>
  );
}
