'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Search,
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  SlidersHorizontal,
  Check,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, money, labels } from '@/lib/api';
import type { Asset } from '@/lib/types';
import {
  allowedList,
  allowedOperations,
  allowsCommercialAds,
  policyApproval,
  policyPrice,
} from '@/lib/policy';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useSession } from './session';
import { Empty, ErrorPanel, Loading, SandboxNote } from './common';

const LANG_LABELS: Record<string, string> = {
  es: 'Español',
  de: 'Alemán',
  en: 'Inglés',
};

function languageLabel(code: string) {
  return LANG_LABELS[code] ?? code.toUpperCase();
}

export function Discover({ savedOnly = false }: { savedOnly?: boolean }) {
  const { user, toast } = useSession(),
    [assets, setAssets] = useState<Asset[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    [category, setCategory] = useState(''),
    [query, setQuery] = useState(''),
    [searchText, setSearchText] = useState(''),
    [territory, setTerritory] = useState(''),
    [approval, setApproval] = useState(''),
    [maxPrice, setMaxPrice] = useState(''),
    [duration, setDuration] = useState('30'),
    [gender, setGender] = useState(''),
    [ageBand, setAgeBand] = useState(''),
    [language, setLanguage] = useState(''),
    [locationFilter, setLocationFilter] = useState(''),
    [aiUsage, setAiUsage] = useState(''),
    [filters, setFilters] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (query) params.set('q', query);
      if (territory) params.set('territory', territory);
      if (approval) params.set('approval', approval);
      if (maxPrice) params.set('max_price', String(Number(maxPrice) * 100));
      if (duration) params.set('duration', duration);
      if (gender) params.set('gender', gender);
      if (ageBand) params.set('age_band', ageBand);
      if (language) params.set('language', language);
      if (locationFilter.trim()) params.set('location', locationFilter.trim());
      if (aiUsage) params.set('ai_usage', aiUsage);
      const result = await api<{ items: Asset[] }>('search?' + params);
      setAssets(result.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [
    category,
    query,
    territory,
    approval,
    maxPrice,
    duration,
    gender,
    ageBand,
    language,
    locationFilter,
    aiUsage,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user)
      api<string[]>('favorites')
        .then(setSaved)
        .catch(() => {});
    else setSaved([]);
  }, [user]);

  async function toggle(id: string) {
    if (!user) {
      toast('Entra al workspace para guardar talento.');
      return;
    }
    try {
      const exists = saved.includes(id);
      await api('favorites/' + id, { method: exists ? 'DELETE' : 'POST', body: {} });
      setSaved((s) => (exists ? s.filter((x) => x !== id) : [...s, id]));
    } catch (e) {
      toast((e as Error).message);
    }
  }

  function resetFilters() {
    setApproval('');
    setMaxPrice('');
    setTerritory('');
    setDuration('30');
    setGender('');
    setAgeBand('');
    setLanguage('');
    setLocationFilter('');
    setAiUsage('');
    setCategory('');
  }

  const filtersActive = !!(
    approval ||
    maxPrice ||
    territory ||
    gender ||
    ageBand ||
    language ||
    locationFilter ||
    aiUsage ||
    category ||
    duration !== '30'
  );

  const visible = savedOnly ? assets.filter((a) => saved.includes(a.id)) : assets;

  return (
    <>
      <div className="discover-top">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />
            MARKETPLACE DE LIKENESS
          </div>
          <h1>{savedOnly ? 'Tu próxima colaboración.' : 'Encuentra talento IA licenciable'}</h1>
          <p>
            {savedOnly
              ? 'Los creadores que has guardado, en un solo lugar.'
              : 'Busca por derechos: industria, territorio, uso de IA y presupuesto. No es un feed social.'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/help">
            Cómo funciona <ArrowUpRight size={16} />
          </Link>
        </Button>
      </div>
      {!savedOnly ? (
        <section className="hero-banner">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span />
              TALENTO LICENCIABLE
            </span>
            <h2>
              Encuentra talento IA
              <br />
              con derechos claros.
            </h2>
            <p>
              Filtra por uso, territorio y aprobación.
              <br />
              Abre Ver derechos para configurar la licencia.
            </p>
            <a href="#talent" className="hero-link">
              Ver talento disponible <ArrowRight size={18} />
            </a>
            <div className="hero-facts">
              <span>
                <Check size={13} />
                Derechos definidos
              </span>
              <span>
                <Check size={13} />
                Licencias verificables
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-grid" />
            <div className="passport-art">
              <div className="art-passport-title">
                <span className="art-r">r.</span>
                <span>
                  RIGHTS PASSPORT<small>IDENTIDAD · CONSENTIMIENTO · DERECHOS</small>
                </span>
                <ShieldCheck size={22} />
              </div>
              <div className="passport-art-body">
                <div className="art-avatar">
                  <Image src="/portraits/creator-1.svg" alt="" fill sizes="110px" />
                </div>
                <div>
                  <span className="art-micro">CREATOR ID / 001</span>
                  <h3>Lucía Martín</h3>
                  <span className="art-verified">
                    <Check size={12} />
                    Perfil de prueba
                  </span>
                  <div className="art-tags">
                    <span>Likeness</span>
                    <span>AI ads</span>
                  </div>
                </div>
              </div>
              <div className="passport-art-footer">
                <span>
                  <span /> LICENCIA CON PERMISO
                </span>
                <span>RN—001 ↗</span>
              </div>
            </div>
            <div className="floating-tag">
              <ShieldCheck size={18} />
              <div>
                Su identidad.<b>Tus ideas. Sus reglas.</b>
              </div>
            </div>
            <span className="art-star">✳</span>
          </div>
        </section>
      ) : null}
      <section id="talent" className="talent-section">
        <div className="section-heading">
          <div>
            <span className="section-number">01 /</span>
            <h2>{savedOnly ? 'Guardados' : 'Talento disponible'}</h2>
          </div>
          <span className="result-count">{visible.length} perfiles de prueba</span>
        </div>
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(searchText);
          }}
        >
          <div className="search-box">
            <Search size={20} />
            <Input
              aria-label="Buscar talento"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Creador lifestyle en Alemania"
            />
            <kbd>↵</kbd>
          </div>
          <Button
            type="button"
            variant="outline"
            className={filters ? 'filter-open' : ''}
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal size={17} />
            Filtros{filtersActive ? <span className="filter-dot" /> : null}
          </Button>
        </form>
        {filters ? (
          <div className="expanded-filters discover-filters-grid">
            <label>
              Género
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Cualquiera</option>
                <option value="female">Mujer</option>
                <option value="male">Hombre</option>
                <option value="non_binary">No binario</option>
              </select>
            </label>
            <label>
              Edad
              <select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
                <option value="">Cualquiera</option>
                <option value="18_24">18–24</option>
                <option value="25_34">25–34</option>
                <option value="35_44">35–44</option>
                <option value="45_plus">45+</option>
              </select>
            </label>
            <label>
              Idioma
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">Cualquiera</option>
                <option value="es">Español</option>
                <option value="de">Alemán</option>
                <option value="en">Inglés</option>
              </select>
            </label>
            <label>
              Ubicación
              <Input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Alemania, Berlín…"
              />
            </label>
            <label>
              Industria
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                <option value="beauty">Belleza</option>
                <option value="lifestyle">Lifestyle</option>
                <option value="fashion">Moda</option>
                <option value="alcohol">Alcohol</option>
              </select>
            </label>
            <label>
              Uso de IA
              <select value={aiUsage} onChange={(e) => setAiUsage(e.target.value)}>
                <option value="">Cualquiera</option>
                <option value="synthetic_image">Imagen sintética</option>
                <option value="synthetic_video">Vídeo sintético</option>
              </select>
            </label>
            <label>
              Territorio
              <select
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
                aria-label="Territorio"
              >
                <option value="">Todos</option>
                <option value="AT">Austria</option>
                <option value="DE">Alemania</option>
                <option value="ES">España</option>
              </select>
            </label>
            <label>
              Duración
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="30">30 días</option>
                <option value="90">90 días</option>
              </select>
            </label>
            <label>
              Presupuesto máximo / {duration} días
              <Input
                type="number"
                min="0"
                placeholder="EUR"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </label>
            <label>
              Tipo de aprobación
              <select value={approval} onChange={(e) => setApproval(e.target.value)}>
                <option value="">Cualquier modalidad</option>
                <option value="automatic">Licencia directa</option>
                <option value="manual">Aprobación del creador</option>
              </select>
            </label>
            <Button variant="ghost" type="button" onClick={resetFilters}>
              Restablecer
            </Button>
          </div>
        ) : null}
        <div className="category-row">
          <span className="collection-label">
            <Sparkles size={14} />
            Facets declarativos del creador · no son KYC
          </span>
        </div>
        {error ? (
          <ErrorPanel message={error} retry={() => void load()} />
        ) : loading ? (
          <Loading />
        ) : visible.length ? (
          <div className="creator-grid">
            {visible.map((a, i) => {
              const niches = allowedList(a.policy, 'categories').slice(0, 2);
              const ops = allowedOperations(a.policy);
              const territories = allowedList(a.policy, 'territories');
              const priceDays = duration === '90' ? 90 : 30;
              const price = policyPrice(a.policy, priceDays as 30 | 90);
              const href = '/creators/' + (a.public_slug || a.id);
              return (
                <article className="creator-card" key={a.id}>
                  <div className={'creator-portrait portrait-' + (i % 6)}>
                    <Link
                      href={href}
                      className="portrait-link"
                      aria-label={'Ver derechos de ' + a.display_name}
                    >
                      <Image
                        src={a.portrait}
                        alt={'Ilustración del perfil ficticio de ' + a.display_name}
                        fill
                        sizes="(max-width: 650px) 90vw, (max-width: 1100px) 45vw, 28vw"
                        priority={i < 3}
                      />
                    </Link>
                    <span className="portrait-badge">
                      <ShieldCheck size={12} />
                      Perfil de prueba
                    </span>
                    <button
                      className={'save-button ' + (saved.includes(a.id) ? 'is-saved' : '')}
                      aria-label={
                        (saved.includes(a.id) ? 'Quitar de guardados a ' : 'Guardar a ') +
                        a.display_name
                      }
                      onClick={() => void toggle(a.id)}
                    >
                      <Bookmark size={17} fill={saved.includes(a.id) ? 'currentColor' : 'none'} />
                    </button>
                    <div className="portrait-bottom">
                      <span>
                        {labels[niches[0]] ?? niches[0] ?? 'AI'}
                      </span>
                      <span>AI LIKENESS</span>
                    </div>
                  </div>
                  <div className="creator-info">
                    <div className="creator-name">
                      <Link href={href}>
                        <h3>{a.display_name}</h3>
                      </Link>
                      <ShieldCheck size={17} />
                    </div>
                    <p className="creator-niches">
                      {niches.map((n) => labels[n] ?? n).join(' · ') || 'Likeness'}
                    </p>
                    <p className="creator-languages">
                      {(a.languages ?? []).map(languageLabel).join(' · ') || '—'}
                    </p>
                    <div className="creator-tags">
                      {ops.includes('synthetic_video') ? <span>AI vídeo ✓</span> : null}
                      {ops.includes('synthetic_image') ? <span>AI imagen ✓</span> : null}
                      {allowsCommercialAds(a.policy) ? <span>Anuncios comerciales ✓</span> : null}
                      {territories.slice(0, 2).map((t) => (
                        <span key={t}>
                          {labels[t] ?? t} ✓
                        </span>
                      ))}
                    </div>
                    <div className="creator-bottom">
                      <div>
                        <span className="price-from">Desde </span>
                        <b>{price == null ? '—' : money(price)}</b>
                        <small>
                          <span
                            className={
                              policyApproval(a.policy) === 'automatic' ? 'green-dot' : 'amber-dot'
                            }
                          />
                          {labels[policyApproval(a.policy)]}
                        </small>
                      </div>
                      <Link href={href} className="card-rights-cta">
                        Ver derechos
                        <ArrowUpRight size={16} />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={savedOnly ? 'Una shortlist con mucho potencial' : 'Todavía no hay coincidencias'}
            description={
              savedOnly
                ? 'Pulsa el marcador de un creador para añadirlo a tu selección.'
                : 'Prueba otros filtros o amplía tu búsqueda.'
            }
            href={savedOnly ? '/discover' : undefined}
          />
        )}
      </section>
      <SandboxNote />
    </>
  );
}
