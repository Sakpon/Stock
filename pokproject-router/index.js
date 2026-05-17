export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // pokproject.com/stock → proxy to stock dashboard
    if (path.startsWith('/stock')) {
      const newPath = path.replace('/stock', '') || '/';
      return fetch(`https://stock-dashboard-8c1.pages.dev${newPath}`, request);
    }

    // pokproject.com/fpl → proxy to FPL (อนาคต)
    if (path.startsWith('/fpl')) {
      const newPath = path.replace('/fpl', '') || '/';
      return fetch(`https://fpl-strategy.pages.dev${newPath}`, request);
    }

    // pokproject.com → landing page
    return new Response(`
      <html>
      <head><title>Pok Project</title></head>
      <body style="font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
        <h1>Pok Project</h1>
        <a href="/stock">Stock Analysis Dashboard</a>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  },
};
