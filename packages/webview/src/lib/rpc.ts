import type { HostApi, HostEvent, RpcRequest, RpcResponse } from '@treeline/shared';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

export const vscode = acquireVsCodeApi();

const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
const listeners = new Set<(e: HostEvent) => void>();
let nextId = 0;

window.addEventListener('message', ({ data }: MessageEvent<RpcResponse | HostEvent>) => {
  if ('event' in data) return listeners.forEach((l) => l(data));
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  if (data.error !== undefined) p.reject(new Error(data.error));
  else p.resolve(data.result);
});

/** Typed proxy: `host.getGraph(q)` posts a request and resolves with the host's reply. */
export const host = new Proxy({} as HostApi, {
  get:
    (_, method: keyof HostApi) =>
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        vscode.postMessage({ id, method, args } satisfies RpcRequest);
      })
});

export function onHostEvent(listener: (e: HostEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
