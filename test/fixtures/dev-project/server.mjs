// A stand-in dev server for the tests. It reads PORT the way a plain Node server does.
import { createServer } from 'node:http';

const port = Number(process.env.PORT);
console.log(`dev-project starting on ${port}`);
createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><title>Dev project</title><h1>Dev project on ${req.headers.host}</h1><p>Path ${req.url}</p>`);
}).listen(port, '127.0.0.1', () => console.log(`ready on http://127.0.0.1:${port}`));
