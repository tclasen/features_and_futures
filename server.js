import { createApplication } from './app.js';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}

const { server, closeDatabase } = createApplication(process.env.DB_PATH ?? 'data/workboard.sqlite');
server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
