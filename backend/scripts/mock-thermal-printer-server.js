const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.MOCK_THERMAL_PRINTER_PORT || 8787);
const outputDir = path.resolve(process.cwd(), 'tmp', 'mock-thermal-printer');

fs.mkdirSync(outputDir, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      const payload = JSON.parse(raw);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = `receipt-${payload?.order?.id || 'unknown'}-${stamp}`;

      fs.writeFileSync(path.join(outputDir, `${baseName}.json`), JSON.stringify(payload, null, 2));
      fs.writeFileSync(path.join(outputDir, `${baseName}.txt`), payload?.receipt?.text || '');

      console.log(`Saved mock receipt for order ${payload?.order?.id || 'unknown'} to ${outputDir}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, savedTo: outputDir }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(port, () => {
  console.log(`Mock thermal printer listening on http://127.0.0.1:${port}`);
  console.log(`Receipt payloads will be saved under ${outputDir}`);
});
