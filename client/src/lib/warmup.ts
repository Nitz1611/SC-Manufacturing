/** VR pattern: pre-warm SQL warehouse on app load (fire-and-forget) */
export function warmupWarehouse(): void {
  fetch('/api/warmup').catch(() => {
    /* ignore — cache-only dev mode */
  });
}
