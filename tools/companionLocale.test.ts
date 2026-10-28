import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createCompanionLocale } from './companionLocale';
import { createWorkbenchBridge } from './workbenchServer';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
function settings() {
  const directory = mkdtempSync(join(tmpdir(), 'build-atlas-locale-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'locale.json');
  return { path, service: createCompanionLocale(path) };
}
describe('desktop language preference', () => {
  it('persists only a validated locale and recovers from corrupt preference files', () => {
    const { path, service } = settings();
    expect(service.read()).toBe('zh-CN');
    service.write('ja');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ locale: 'ja' });
    expect(createCompanionLocale(path).read()).toBe('ja');
    writeFileSync(path, 'invalid');
    expect(createCompanionLocale(path).read()).toBe('zh-CN');
  });
  it('shares all three browser languages with the native helper and rejects invalid or remote writes', async () => {
    const { service } = settings();
    const bridge = createWorkbenchBridge({ companionLocale: service });
    const server = createServer((request, response) => { void bridge.handle(request, response); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => { bridge.close(); server.closeAllConnections(); server.close(); });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/workbench/companion-locale`;
    for (const locale of ['en', 'ja', 'zh-CN']) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale }) });
      expect(response.status).toBe(200);
      expect(await (await fetch(url)).json()).toEqual({ locale });
    }
    expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'invalid' }) })).status).toBe(400);
    expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify({ locale: 'en' }) })).status).toBe(403);
    expect(service.read()).toBe('zh-CN');
  });
});
