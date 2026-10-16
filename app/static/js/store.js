async function request(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Can't reach the lab server. Check that python app/server.py is still running.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    if (typeof detail === 'string') throw new Error(detail);
    if (res.status === 422) throw new Error('That URL is too long. Keep it under 2,048 characters.');
    throw new Error(`The server answered with an error (${res.status}). Check the terminal running app/server.py.`);
  }
  return body;
}

export const api = {
  results: () => request('/api/results'),
  scan: (url) => request('/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  }),
};

// The URL under inspection is shared by the Scan and Attack lab tabs.
export function createScanStore() {
  let state = { input: '', result: null, loading: false, error: null };
  const subscribers = new Set();
  let latest = 0;
  const emit = () => subscribers.forEach((fn) => fn(state));

  return {
    get: () => state,
    subscribe(fn) {
      subscribers.add(fn);
      fn(state);
      return () => subscribers.delete(fn);
    },
    async scan(input) {
      const id = ++latest;
      state = { ...state, input, loading: true, error: null };
      emit();
      try {
        const result = await api.scan(input);
        if (id !== latest) return;
        state = { ...state, result, loading: false };
      } catch (err) {
        if (id !== latest) return;
        state = { ...state, loading: false, error: err.message };
      }
      emit();
    },
  };
}
