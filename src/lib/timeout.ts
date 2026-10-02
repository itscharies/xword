/** Races `p` against a timer that rejects with `Error("<label> timed out
 *  after <ms>ms")`; the timer is cleared as soon as `p` settles either way.
 *
 *  Why not `.abortSignal(AbortSignal.timeout(ms))` on the query? That signal
 *  only covers the PostgREST request itself. supabase-js first awaits
 *  `auth.getSession()`, which after the 1 h JWT expiry spends ~25 s inside
 *  auth-js's refresh retry loop before the request is even built — and an
 *  `AbortSignal.timeout` created before that wait has already fired by the
 *  time the fetch starts, so it aborts nothing useful. Wrapping the whole
 *  promise is the only bound that covers both phases. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
