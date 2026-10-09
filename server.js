import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const server = createApp(process.env.DB_PATH ?? './data/workboard.sqlite');
server.listen(port, '0.0.0.0', () => {
  console.log(`Workboard listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
