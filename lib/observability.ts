// Bentuk log galat server yang dikirim ke Workers Logs (lewat console.error). Hanya metadata permintaan:
// tanpa header (cookie sesi, token), tanpa body, dan tanpa query string (bisa memuat token atau data pribadi).
export type RequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
};

export function formatRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: RequestErrorContext = {}
) {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined;
  return {
    level: 'error',
    event: 'request_error',
    message: message.slice(0, 300),
    digest,
    name: err instanceof Error ? err.name : undefined,
    method: request.method,
    path: request.path.split('?')[0],
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  };
}
