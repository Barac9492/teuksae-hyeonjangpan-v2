// Covers fetch AND response-body decoding. Some transports/mocks ignore AbortSignal,
// so the deadline also rejects independently to release UI locks in bounded time.
export const REQUEST_TIMEOUT_MS = 15_000;
export class RequestTimeoutError extends Error {
  constructor() { super('응답을 기다리는 시간이 길어 연결을 중단했어요. 처리 결과는 아직 확인되지 않았어요.'); this.name = 'RequestTimeoutError'; }
}
export async function requestWithDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { reject(new DOMException('Request cancelled', 'AbortError')); controller.abort(); };
    if (options.signal?.aborted) { cancel(); return; }
    options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => { reject(new RequestTimeoutError()); controller.abort(); }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      return operation(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
