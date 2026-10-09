import { createApp } from './app.js';
import { openProjectStore } from './project-store.js';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}
const store = openProjectStore(process.env.DB_PATH ?? './data/workboard.sqlite');
const server = createApp(store);
server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
server.on('error', (error) => {
  console.error(error);
  store.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => store.close()));
}
