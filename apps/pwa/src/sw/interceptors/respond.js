// Response helpers shared by the interceptors.
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const csv = (body) =>
  new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });

// A FetchInterceptor is `{ match(request): boolean, execute(request): Promise<Response> }`.
export const path = (request) => new URL(request.url).pathname;
export const query = (request) => new URL(request.url).searchParams;
