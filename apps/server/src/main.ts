import { buildApp } from './app.js';

const DEFAULT_PORT = 3000;

function readPort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

const app = buildApp();

try {
  await app.listen({ port: readPort(), host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
