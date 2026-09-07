import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const base = process.env.API_URL ?? 'http://127.0.0.1:4000';

function sessionCookieOpts(req: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge,
  };
}

function applyAuthCookies(
  response: NextResponse,
  req: NextRequest,
  data: { token: string; refresh_token?: string; expires_in?: number },
) {
  const accessMax = Math.max(60, Number(data.expires_in ?? 8 * 3600));
  response.cookies.set('rightsnet_session', data.token, sessionCookieOpts(req, accessMax));
  if (data.refresh_token)
    response.cookies.set(
      'rightsnet_refresh',
      data.refresh_token,
      sessionCookieOpts(req, 30 * 24 * 3600),
    );
}

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.join('/');
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const allowedOrigins = (
      process.env.WEB_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000'
    ).split(',');
    if (!origin || !allowedOrigins.includes(origin))
      return NextResponse.json(
        { error: { code: 'ORIGIN_REJECTED', message: 'Origen no permitido.' } },
        { status: 403 },
      );
  }
  const jar = await cookies();
  const token = jar.get('rightsnet_session')?.value;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const key = req.headers.get('idempotency-key');
  if (key) headers['Idempotency-Key'] = key;

  let bodyText: string | undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    bodyText = await req.text();
    if (joined === 'auth/supabase/refresh') {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      if (typeof parsed.refresh_token !== 'string' || !parsed.refresh_token) {
        const refresh = jar.get('rightsnet_refresh')?.value;
        if (!refresh)
          return NextResponse.json(
            { error: { code: 'UNAUTHENTICATED', message: 'No hay sesión renovable.' } },
            { status: 401 },
          );
        bodyText = JSON.stringify({ refresh_token: refresh });
      }
    }
  }

  try {
    const upstream = await fetch(
      base + '/v1/' + path.map(encodeURIComponent).join('/') + req.nextUrl.search,
      {
        method: req.method,
        headers,
        body: bodyText,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );

    if (
      (joined === 'auth/sandbox' ||
        joined === 'auth/supabase/login' ||
        joined === 'auth/supabase/signup' ||
        joined === 'auth/supabase/session' ||
        joined === 'auth/supabase/refresh') &&
      upstream.ok
    ) {
      const data = (await upstream.json()) as {
        token?: string;
        refresh_token?: string;
        expires_in?: number;
        user: unknown;
        status?: string;
        message?: string;
      };
      if (!data.token) {
        return NextResponse.json(data);
      }
      const response = NextResponse.json({
        user: data.user,
        status: data.status ?? 'session',
      });
      applyAuthCookies(response, req, {
        token: data.token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
      return response;
    }

    const response = new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
        ...(upstream.headers.get('content-disposition')
          ? { 'Content-Disposition': upstream.headers.get('content-disposition')! }
          : {}),
      },
    });
    if (joined === 'auth/logout') {
      response.cookies.delete('rightsnet_session');
      response.cookies.delete('rightsnet_refresh');
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: 'API_UNAVAILABLE', message: 'No se puede conectar con la API local.' } },
      { status: 503 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE };
