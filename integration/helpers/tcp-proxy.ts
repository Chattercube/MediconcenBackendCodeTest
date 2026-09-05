import { createConnection, createServer, Socket } from 'node:net';

// Fault injection affects only connections opened through this test-owned proxy.
export class TcpProxy {
  private online = true;
  private readonly sockets = new Set<Socket>();
  private readonly server = createServer((socket) => {
    if (!this.online) {
      socket.destroy();
      return;
    }
    const upstream = createConnection({
      host: this.host,
      port: this.targetPort,
    });
    for (const connection of [socket, upstream]) {
      this.sockets.add(connection);
      connection.on('error', () => {});
      connection.on('close', () => {
        this.sockets.delete(connection);
        socket.destroy();
        upstream.destroy();
      });
    }
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  constructor(
    private readonly host: string,
    private readonly targetPort: number,
  ) {}

  async start(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test proxy did not open a TCP port');
    return address.port;
  }

  setOnline(online: boolean) {
    this.online = online;
    if (!online) for (const socket of this.sockets) socket.destroy();
  }

  async close() {
    this.setOnline(false);
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
