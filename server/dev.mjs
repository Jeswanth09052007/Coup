// One command starts Vite and the authoritative game server.
import { createGameServer } from './index.mjs';
import { createServer } from 'vite';
const game = createGameServer({ origins: ['http://localhost:5173', 'http://127.0.0.1:5173'], serveStatic: false });
// Local preview proxy preserves the browser's Origin. Only development allows the preview origin.
game.io.engine.opts.allowRequest = (_req, callback) => callback(null, true);
await new Promise(resolve => game.http.listen(3001, '127.0.0.1', resolve));
const portArg = process.argv.indexOf('--port');
const vite = await createServer({ server: { port: portArg >= 0 ? Number(process.argv[portArg + 1]) : 5173, strictPort: true } }); await vite.listen(); vite.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await vite.close(); await game.close(); process.exit(0); });
