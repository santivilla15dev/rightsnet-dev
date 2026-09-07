export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  CATEGORY_DENIED: 'Esta categoría no está permitida por el creador.',
  TERRITORY_NOT_ALLOWED: 'El territorio solicitado no está incluido.',
  CHANNEL_NOT_ALLOWED: 'Uno de los canales no está permitido.',
  APPROVAL_REQUIRED: 'El creador debe aprobar esta solicitud.',
  START_TOO_SOON: 'El inicio debe ser al menos 24 horas después del momento actual.',
  POLICY_STALE: 'Los derechos han cambiado. Crea una nueva solicitud.',
  QUOTE_EXPIRED: 'La cotización ha caducado. Solicita una nueva.',
  ORDER_NOT_PAYABLE: 'Esta orden ya no admite pagos. Revisa su estado.',
  ORDER_EXPIRED: 'Esta orden de prueba caducó. Crea una campaña nueva desde Descubrir talento.',
  INVALID_STATE: 'Este paso no está disponible en el estado actual. Recarga o crea una nueva campaña.',
  UNAUTHENTICATED: 'Inicia sesión para continuar.',
  AUTH_FAILED: 'Correo o contraseña incorrectos.',
  SUPABASE_NOT_CONFIGURED: 'Supabase no está configurado: revisa SUPABASE_URL y SUPABASE_ANON_KEY.',
  SUPABASE_AUTH_DISABLED: 'Auth Supabase no está activo en este entorno.',
  ACCOUNT_NOT_PROVISIONED: 'Tu cuenta de Auth aún no está vinculada a RightsNet.',
  EMAIL_ALREADY_LINKED: 'Este correo ya pertenece a otra cuenta RightsNet.',
  FORBIDDEN: 'Tu rol no permite esta acción.',
  NOT_FOUND: 'No encontramos este recurso o no tienes acceso.',
  CONSENT_REQUIRED: 'Acepta la versión actual de tu política.',
  CONNECT_ONBOARDING_REQUIRED: 'Completa el onboarding de cobros (Stripe Connect) antes de continuar.',
  CONNECT_PLATFORM_REQUIRED:
    'Tu cuenta Stripe aún no es plataforma Connect. Completa Connect → platform setup en el Dashboard (modo test) y reintenta.',
  CONNECT_STRIPE_ERROR: 'Stripe no pudo completar Connect. Revisa el Dashboard en modo test.',
  STRIPE_NOT_CONFIGURED: 'Stripe no está configurado: revisa PAYMENTS_PROVIDER y STRIPE_SECRET_KEY (sk_test_…).',
  INVALID_SIGNATURE: 'La firma del webhook de Stripe no es válida.',
  CREATOR_REQUIRED: 'Crea tu perfil de creador antes de continuar.',
  REFUND_FAILED: 'El reembolso falló en Stripe. Requiere revisión operativa.',
  API_UNAVAILABLE: 'No podemos conectar con el servidor. Comprueba que pnpm dev está en ejecución.',
};
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/' + path, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.method && options.method !== 'GET'
          ? { 'Idempotency-Key': options.key ?? crypto.randomUUID() }
          : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('API_UNAVAILABLE', messages.API_UNAVAILABLE, 503);
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error?.code ?? 'ERROR',
      messages[data.error?.code] ?? data.error?.message ?? 'No se pudo completar la acción.',
      response.status,
    );
  return data as T;
}
export const money = (minor: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(minor / 100);
export const date = (value: string) =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
export const labels: Record<string, string> = {
  automatic: 'Licencia directa',
  manual: 'Con aprobación',
  beauty: 'Belleza',
  fashion: 'Moda',
  lifestyle: 'Lifestyle',
  politics: 'Política',
  political_advertising: 'Publicidad política',
  adult: 'Adultos',
  alcohol: 'Alcohol',
  gambling: 'Apuestas',
  tobacco: 'Tabaco',
  synthetic_image: 'Imagen con IA',
  synthetic_video: 'Vídeo con IA',
  INCOMPLETE: 'Incompleta',
  published: 'Publicado',
  draft: 'Borrador',
  pending_review: 'En revisión',
  suspended: 'Suspendido',
  rejected: 'Rechazado',
  reviewed: 'Vínculo revisado',
  verified: 'Identidad verificada',
  pending: 'Pendiente',
  ALLOW: 'Aprobada',
  DENY: 'No permitido',
  REQUIRES_APPROVAL: 'Esperando aprobación',
  awaiting_acceptance: 'Por aceptar',
  awaiting_payment: 'Pendiente de pago',
  payment_processing: 'Procesando pago',
  paid: 'Pago recibido',
  issuing: 'Preparando licencia',
  fulfilled: 'Licencia emitida',
  paid_requires_review: 'Revisión necesaria',
  refunded: 'Reembolsado',
  VALID: 'Válida',
  NOT_YET_VALID: 'Programada',
  EXPIRED: 'Caducada',
  REVOKED: 'Revocada',
  SUSPENDED: 'Suspendida',
  INVALID: 'Inválida',
  issued: 'Emitida',
  ES: 'España',
  DE: 'Alemania',
  AT: 'Austria',
};
