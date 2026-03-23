type MutationErrorPayload = {
  error?: string;
};

export async function runServerMutation<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch('/api/mutations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null) as (T & MutationErrorPayload) | null;
  if (!response.ok) {
    throw new Error(
      payload?.error
      || `Server mutation failed with status ${response.status}`,
    );
  }

  return (payload ?? {}) as T;
}
