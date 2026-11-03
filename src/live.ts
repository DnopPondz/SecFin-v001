import { DurableObject } from "cloudflare:workers";

export interface TickerItem {
  title: string;
  url: string;
  sourceName: string;
  category: string;
  published: number;
}

const KEEP = 30;

// One instance for every viewer. WebSockets use the hibernation API, so an idle connection
// costs no Durable Object duration; the queue consumer calls publish() after each feed.
export class LiveFeed extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "recent", items: await this.recent() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async publish(items: TickerItem[]): Promise<void> {
    if (items.length === 0) return;
    const merged = [...items, ...(await this.recent())]
      .filter((it, i, all) => all.findIndex((o) => o.url === it.url) === i)
      .sort((a, b) => b.published - a.published)
      .slice(0, KEEP);
    await this.ctx.storage.put("recent", merged);
    const msg = JSON.stringify({ type: "new", items });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // a socket that is closing; the runtime drops it
      }
    }
  }

  async recent(): Promise<TickerItem[]> {
    return (await this.ctx.storage.get<TickerItem[]>("recent")) ?? [];
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "closing");
  }
}
