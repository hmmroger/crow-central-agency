import { describe, it, expect, vi } from "vitest";
import type { WebSocket } from "ws";
import { WsBroadcaster } from "./ws-broadcaster.js";

function createFakeClient(): WebSocket {
  const client = {
    readyState: 1,
    OPEN: 1,
    CONNECTING: 0,
    send: vi.fn(),
    terminate: vi.fn(),
  };
  return client as unknown as WebSocket;
}

describe("WsBroadcaster.closeAll", () => {
  it("terminates every tracked client and empties the set", () => {
    const broadcaster = new WsBroadcaster();
    const clientA = createFakeClient();
    const clientB = createFakeClient();
    broadcaster.addClient(clientA);
    broadcaster.addClient(clientB);

    broadcaster.closeAll();

    expect(clientA.terminate).toHaveBeenCalledTimes(1);
    expect(clientB.terminate).toHaveBeenCalledTimes(1);
    expect(broadcaster.getClientCount()).toBe(0);
  });

  it("stays consistent when terminate re-enters removeClient via a close handler", () => {
    const broadcaster = new WsBroadcaster();
    const client = createFakeClient();
    // Simulate ws firing 'close' synchronously during terminate().
    vi.mocked(client.terminate).mockImplementation(() => {
      broadcaster.removeClient(client);
    });
    broadcaster.addClient(client);

    expect(() => broadcaster.closeAll()).not.toThrow();
    expect(client.terminate).toHaveBeenCalledTimes(1);
    expect(broadcaster.getClientCount()).toBe(0);
  });
});
