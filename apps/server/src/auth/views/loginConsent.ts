export function renderLoginConsentPage(opts: {
  requestId: string;
  clientName: string;
  scope: string;
  error?: string;
}): string {
  const { requestId, clientName, scope, error } = opts;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sign in — TokenBurners LinkedIn</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, sans-serif; max-width: 420px; margin: 64px auto; padding: 0 16px; color: #1a1a1a; }
      h1 { font-size: 1.25rem; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 24px; }
      label { display: block; margin-top: 12px; font-size: 0.875rem; }
      input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
      button { margin-top: 20px; width: 100%; padding: 10px; background: #0a66c2; color: white; border: none; border-radius: 4px; cursor: pointer; }
      .error { color: #b00020; font-size: 0.875rem; margin-top: 8px; }
      .scope { color: #555; font-size: 0.8rem; margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Sign in to authorize ${escapeHtml(clientName)}</h1>
      <p class="scope">Requested access: ${escapeHtml(scope)}</p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <form method="POST" action="/oauth/login">
        <input type="hidden" name="request_id" value="${escapeHtml(requestId)}" />
        <label>Email
          <input type="email" name="email" required autofocus />
        </label>
        <label>Password
          <input type="password" name="password" required />
        </label>
        <button type="submit">Sign in &amp; authorize</button>
      </form>
    </div>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
