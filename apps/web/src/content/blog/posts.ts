export type BlogAudience = 'marcas' | 'creadores' | 'ambos';

export type BlogSection = {
  heading?: string;
  paragraphs: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  audience: BlogAudience;
  cta: { href: string; label: string };
  sections: BlogSection[];
};

export const audienceLabel: Record<BlogAudience, string> = {
  ambos: 'Marcas y creadores',
  marcas: 'Marcas y agencias',
  creadores: 'Creadores',
};

export const posts: BlogPost[] = [
  {
    slug: 'que-es-rightsnet',
    title: 'Qué es RightsNet',
    summary:
      'Infraestructura para licenciar la imagen de personas reales en publicidad hecha con IA, con permiso claro y verificable.',
    publishedAt: '2026-09-10',
    audience: 'ambos',
    cta: { href: '/discover', label: 'Explorar creadores' },
    sections: [
      {
        paragraphs: [
          'RightsNet existe para responder una pregunta concreta: ¿puede una marca o agencia obtener permiso claro, pagado y verificable para usar la likeness de un creador adulto en publicidad generada con IA?',
          'No somos un generador de vídeo ni una red social. Somos la capa de derechos entre el talento y el uso comercial sintético: descubrir perfiles, configurar el uso, comprobar reglas, aceptar términos y emitir una licencia con certificado firmado.',
        ],
      },
      {
        heading: 'Qué problema resuelve',
        paragraphs: [
          'En campañas con IA, el riesgo no es solo creativo: es no saber si el uso está permitido, en qué territorios, durante cuánto tiempo y con qué límites. Un correo o un pantallazo de contrato no escalan.',
          'RightsNet convierte esa conversación en un recorrido de producto: uso estructurado, decisión del motor de derechos, resumen de licencia y token público verificable (por ejemplo RN-LIC-…).',
        ],
      },
      {
        heading: 'Qué no afirma (aún)',
        paragraphs: [
          'El producto opera con plantillas contractuales provisionales y pagos de prueba hasta las condiciones de lanzamiento documentadas. No sustituye asesoría legal ni clearance fiscal de un país concreto.',
          'Si quieres el “cómo se hace clic a clic”, la Guía del producto está en /help. Este blog explica el porqué.',
        ],
      },
    ],
  },
  {
    slug: 'para-marcas-y-agencias',
    title: 'Para marcas y agencias',
    summary:
      'De descubrir talento a una licencia firmada: menos ambigüedad cuando la campaña usa imagen sintética de personas reales.',
    publishedAt: '2026-09-10',
    audience: 'marcas',
    cta: { href: '/signup?intent=buyer', label: 'Crear cuenta de marca' },
    sections: [
      {
        paragraphs: [
          'Si tu equipo planifica anuncios con likeness sintética, necesitas tres cosas: talento compatible, reglas explícitas y un rastro que se pueda enseñar a legal, al cliente o a un partner.',
          'RightsNet encaja en ese flujo sin pedirte cuenta solo para mirar: Discover es público. La autenticación entra cuando continúas hacia la licencia.',
        ],
      },
      {
        heading: 'El recorrido típico',
        paragraphs: [
          '1) Exploras perfiles y abres una ficha. 2) Configuras campaña, territorios, canales y duración. 3) Comprobamos derechos contra la política del creador. 4) Aceptas el resumen de licencia y pagas en modo prueba. 5) Recibes un certificado firmado que puedes verificar.',
          'Si la política del creador exige revisión humana, la solicitud queda en aprobación: no inventamos un “sí” automático donde el talento pide control.',
        ],
      },
      {
        heading: 'Qué ganas como comprador',
        paragraphs: [
          'Alcance de uso escrito (no solo un precio). Una organización como licenciatario. Un token verificable en lugar de un PDF suelto en el Drive del equipo.',
          'Para operar el día a día, sigue la Guía. Para empezar a explorar talento, ve a Discover.',
        ],
      },
    ],
  },
  {
    slug: 'para-creadores',
    title: 'Para creadores',
    summary:
      'Publica tus reglas de likeness, decide aprobación automática o manual y licencia tu imagen con rastro claro.',
    publishedAt: '2026-09-10',
    audience: 'creadores',
    cta: { href: '/signup?intent=creator', label: 'Licenciar mi likeness' },
    sections: [
      {
        paragraphs: [
          'Tu imagen en IA no debería ser un “vale, usa lo que quieras” por DM. RightsNet te da un perfil publicable, una política de derechos que tú defines y un espacio para aprobar o rechazar usos sensibles.',
          'La cuenta no te encierra en un solo rol: puedes ser creador y, con otra organización, también marca. Eliges el primer espacio tras registrarte.',
        ],
      },
      {
        heading: 'Control que se entiende',
        paragraphs: [
          'Defines industrias, territorios, canales, duración y si el uso pasa automático o pide tu visto bueno. Cuando una marca configura una campaña, el motor aplica esas reglas de forma determinista.',
          'Tras la licencia, el uso queda documentado. Puedes ver solicitudes, licencias e ingresos de prueba en tu panel. No prometemos payouts bancarios reales hasta los gates de lanzamiento.',
        ],
      },
      {
        heading: 'Cómo empezar',
        paragraphs: [
          'Crea cuenta, completa onboarding (identidad y likeness según el entorno), espera aprobación operativa si aplica, publica y ajusta tu política. La Guía detalla cada paso; el CTA de abajo abre el alta con intención creador.',
        ],
      },
    ],
  },
  {
    slug: 'por-que-importa-la-verificacion',
    title: 'Por qué importa la verificación',
    summary:
      'Un certificado firmado no es lo mismo que un pantallazo de un acuerdo. La verificación pública reduce la duda.',
    publishedAt: '2026-09-10',
    audience: 'ambos',
    cta: { href: '/help#verification', label: 'Ver la guía de verificación' },
    sections: [
      {
        paragraphs: [
          'En derechos digitales, “te lo juro” no escala. Un correo se pierde; un PDF se edita; un chat se malinterpreta. RightsNet emite licencias con token público y firma criptográfica que cualquiera puede comprobar en la página de verificación.',
          'Eso no es un tribunal ni un sello notarial: es evidencia técnica de que la plataforma emitió ese permiso con un alcance concreto en un momento concreto.',
        ],
      },
      {
        heading: 'Qué puedes comprobar',
        paragraphs: [
          'Estado de la licencia, datos de alcance capturados en el certificado y que la firma corresponde a las claves de RightsNet. Si se suspende o reembolsa según las reglas del producto, el estado público refleja el cambio.',
          'También existen verificaciones relacionadas (por ejemplo generaciones o passports de campaña en flujos B2B). El punto común: no confundir “preview de política” con autoridad ejecutable, ni un pantallazo con un token firmado.',
        ],
      },
      {
        heading: 'Cómo encaja con marcas y creadores',
        paragraphs: [
          'La marca puede compartir el enlace de verificación con stakeholders. El creador puede demostrar qué usos autorizó. Ambos reducen fricción cuando alguien pregunta “¿quién dio permiso?”.',
          'Para emitir tu primera licencia de prueba, empieza en Discover o crea cuenta. Para el detalle operativo, usa la Guía.',
        ],
      },
    ],
  },
];

export function listPosts(): BlogPost[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
