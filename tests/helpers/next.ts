import { NextRequest, type NextResponse } from 'next/server';

type InvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

type InvokeResult = {
  status: number;
  body: any;
  response: NextResponse;
};

function toHeaders(init?: Record<string, string>): Headers {
  const headers = new Headers();
  if (!init) {
    return headers;
  }
  for (const [key, value] of Object.entries(init)) {
    if (typeof value === 'string') {
      headers.set(key.toLowerCase(), value);
    }
  }
  return headers;
}

export async function invokePost(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: InvokeOptions = {}
): Promise<InvokeResult> {
  const headers = toHeaders(options.headers);
  let body: string | undefined;

  if (options.body !== undefined) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    body = JSON.stringify(options.body);
  }

  const request = new Request('http://localhost/api/jobs/ingest:run', {
    method: 'POST',
    headers,
    body
  });

  const nextRequest = new NextRequest(request);
  const response = await handler(nextRequest);
  const text = await response.text();
  let parsed: any = text;

  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // Leave as plain text when JSON parsing fails.
  }

  return {
    status: response.status,
    body: parsed,
    response
  };
}
