import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { readDamageAttribution } from '../src/workbench/damageAttribution';

export class AttributionError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export interface AttributionRequest { xml: string; itemSetId: string; secondWeapons: boolean; skill: { setId: string; group: number; name: string; id: string }; excludedGroups: number[] }
export function attributionRequest(value: unknown): AttributionRequest {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || typeof value.xml !== 'string' || Buffer.byteLength(value.xml) > 3_000_000 || !/^<PathOfBuilding2(?:\s|>)/.test(value.xml)
    || /<!DOCTYPE|<!ENTITY|<(?:Import|Notes|Account)\b/i.test(value.xml) || typeof value.itemSetId !== 'string' || !/^\d{1,6}$/.test(value.itemSetId)
    || typeof value.secondWeapons !== 'boolean' || !object(value.skill) || typeof value.skill.setId !== 'string' || !/^\d{1,6}$/.test(value.skill.setId)
    || !Number.isInteger(value.skill.group) || Number(value.skill.group) < 1 || Number(value.skill.group) > 100
    || typeof value.skill.name !== 'string' || !value.skill.name || value.skill.name.length > 200 || typeof value.skill.id !== 'string' || value.skill.id.length > 300
    || !Array.isArray(value.excludedGroups) || value.excludedGroups.length > 100 || value.excludedGroups.some((n) => !Number.isInteger(n) || Number(n) < 1 || Number(n) > 100)) throw new AttributionError(400, '重算请求不完整；请重新导入 PoB2 并明确选择输出技能。');
  return { xml: value.xml, itemSetId: value.itemSetId, secondWeapons: value.secondWeapons, skill: value.skill as unknown as AttributionRequest['skill'], excludedGroups: [...new Set(value.excludedGroups as number[])] };
}
export function createDamageAttributionService(project = process.cwd()) {
  let busy = false;
  return async (input: unknown) => {
    const request = attributionRequest(input);
    if (process.platform !== 'win32') throw new AttributionError(503, '当前重算器需要 Windows 本地版与官方 PoB2 v0.23.1。');
    if (busy) throw new AttributionError(409, '已有 PoB 重算任务，请等待完成后再试。');
    busy = true;
    let directory: string | undefined;
    try {
      const install = resolve(project, '.local-tools/pob2-v0.23.1'), tools = resolve(project, 'tools/pob');
      if (!await stat(join(install, 'lua51.dll')).then((info) => info.isFile()).catch(() => false)) throw new AttributionError(503, '请先运行 start-pob2.cmd 安装官方 PoB2 v0.23.1。');
      const manifest = await readFile(join(install, 'manifest.xml'), 'utf8').catch(() => '');
      if (!/<Version\b[^>]*\bnumber="0\.23\.1"/.test(manifest)) throw new AttributionError(503, '本机 PoB 版本与验证版 v0.23.1 不一致，暂不输出未经验证的贡献结果。');
      directory = await mkdtemp(join(tmpdir(), 'poe2-workbench-attribution-'));
      const requestFile = join(directory, 'request.json'), resultFile = join(directory, 'result.json');
      await writeFile(requestFile, JSON.stringify(request), 'utf8');
      await new Promise<void>((done, fail) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(tools, 'run.ps1'), '-Install', install, '-Script', join(tools, 'attribution.lua'), '-Request', requestFile, '-Response', resultFile, '-Wrapper', join(tools, 'HeadlessWrapper.lua')], { cwd: install, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
        let timedOut = false, size = 0;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
        const consume = (chunk: Buffer) => { size += chunk.length; if (size > 1_000_000) child.kill(); };
        child.stdout.on('data', consume); child.stderr.on('data', consume);
        child.once('error', () => { clearTimeout(timer); fail(new AttributionError(503, '无法启动隔离 PoB 计算进程。')); });
        child.once('close', (code) => { clearTimeout(timer); if (timedOut) fail(new AttributionError(504, 'PoB 逐词缀重算超过两分钟，请缩小配置后重试。')); else if (code === 0) done(); else fail(new AttributionError(422, 'PoB 无法完成该配置的逐词缀重算。请在 v0.23.1 打开并转换保存，确认技能有效且有正伤害，再重新导入；未生成贡献数值。')); });
      });
      if ((await stat(resultFile)).size > 2_000_000) throw new AttributionError(422, '重算结果过大，未采用。');
      return readDamageAttribution(JSON.parse(await readFile(resultFile, 'utf8')) as unknown);
    } finally {
      busy = false;
      if (directory) { const location = relative(tmpdir(), directory); if (!isAbsolute(location) && !location.startsWith('..') && /^poe2-workbench-attribution-[^/\\]+$/.test(location)) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    }
  };
}
