'use client';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Title } from './common';
import { Button } from './ui/button';
import { audienceLabel, getPost, listPosts, type BlogPost } from '@/content/blog/posts';

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function PostMeta({ post }: { post: BlogPost }) {
  return (
    <p className="blog-meta">
      <span>{formatDate(post.publishedAt)}</span>
      <span aria-hidden>·</span>
      <span>{audienceLabel[post.audience]}</span>
    </p>
  );
}

export function BlogIndex() {
  const items = listPosts();
  return (
    <>
      <Title
        eyebrow="BLOG"
        title="Historias y contexto."
        description="Por qué existe RightsNet y a quién ayuda. La guía operativa sigue en /help."
      />
      <ul className="blog-list">
        {items.map((post) => (
          <li key={post.slug}>
            <article className="blog-list-item">
              <PostMeta post={post} />
              <h2>
                <Link href={'/blog/' + post.slug}>{post.title}</Link>
              </h2>
              <p>{post.summary}</p>
              <Link className="home-text-link" href={'/blog/' + post.slug}>
                Leer
                <ArrowRight size={16} />
              </Link>
            </article>
          </li>
        ))}
      </ul>
      <p className="blog-aside">
        ¿Buscas pasos concretos?{' '}
        <Link href="/help" className="home-text-link">
          Guía del producto
          <ArrowUpRight size={14} />
        </Link>
      </p>
    </>
  );
}

export function BlogPostView({ slug }: { slug: string }) {
  const post = getPost(slug);
  if (!post) return null;
  return (
    <article className="blog-post">
      <p className="blog-kicker">
        <Link href="/blog">Blog</Link>
        <span aria-hidden> / </span>
        {audienceLabel[post.audience]}
      </p>
      <h1>{post.title}</h1>
      <PostMeta post={post} />
      <p className="blog-lead">{post.summary}</p>
      {post.sections.map((section, i) => (
        <section key={i} className="blog-section">
          {section.heading ? <h2>{section.heading}</h2> : null}
          {section.paragraphs.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
        </section>
      ))}
      <div className="blog-cta">
        <Button asChild>
          <Link href={post.cta.href}>
            {post.cta.label}
            <ArrowRight size={16} />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/blog">Más artículos</Link>
        </Button>
      </div>
    </article>
  );
}
