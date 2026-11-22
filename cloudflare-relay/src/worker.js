import { DurableObject } from 'cloudflare:workers';
import { BattleRoomCore, createWorkerHandler } from './room-core.js';

export class BattleRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this._core = new BattleRoomCore(ctx, env);
  }

  fetch(request) {
    return this._core.fetch(request);
  }

  webSocketMessage(ws, message) {
    return this._core.webSocketMessage(ws, message);
  }

  webSocketClose(ws) {
    return this._core.webSocketClose(ws);
  }

  webSocketError(ws) {
    return this._core.webSocketError(ws);
  }
}

export default createWorkerHandler();
