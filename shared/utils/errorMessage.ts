/** Best-effort human message from a thrown value. Covers `Error` and the
 *  `{ message }` shape Supabase / PostgREST errors use (which are plain objects,
 *  not `Error` instances), falling back when neither applies. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const message = (e as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
