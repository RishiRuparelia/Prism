import createServer from '@tomphttp/bare-server-node';
import http from 'http';
import nodeStatic from 'node-static';
const port = process.env.PORT || 8080;
import { fileURLToPath } from "url";
import { createRequire } from "module";

const bare =  createServer('/bare/');
const serve = new nodeStatic.Server('main/');
const require = createRequire(import.meta.url);

const server = http.createServer();

server.on('request', (req, res) => {
  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res);
  } else {
    serve.serve(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  if (bare.shouldRoute(req, socket, head)) {
    bare.routeUpgrade(req, socket, head);
  }else{
    socket.end();
  }
});

server.listen({
  port: port,
});

console.log(`Listening on http://localhost:${port}`)
