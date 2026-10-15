// ComfyUI asset generator.
//   node tools/assetgen/src/generate.ts [--only=tokens/,props/] [--force] [--post-only] [--sheet] [--check]
// Needs a running ComfyUI (default http://127.0.0.1:8188, override with COMFY_URL) with the
// DreamShaper XL Lightning checkpoint. Raw candidates land in tools/assetgen/raw/, the picked and
// post-processed sprites in packages/client/public/assets/gen/ (+ manifest.json).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { catalog, NEGATIVE, type AssetSpec } from './catalog.ts';
import { writeManifest } from './manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const RAW = join(root, 'raw');
const OUT = resolve(root, '../../packages/client/public/assets/gen');
const PICKS = join(root, 'picks.json');
const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const CKPT = process.env.COMFY_CKPT ?? 'DreamShaperXL_Lightning.safetensors';
const PY = process.platform === 'win32' ? join(root, '.venv/Scripts/python.exe') : join(root, '.venv/bin/python');

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const force = flag('force');

const BOX: Record<AssetSpec['kind'], number> = { token: 512, prop: 384, item: 256, objective: 256, ground: 1536, backdrop: 1536 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rawFile(spec: AssetSpec, k: number): string {
  return join(RAW, `${spec.path}_${k}.png`);
}

function picks(): Record<string, number> {
  return existsSync(PICKS) ? (JSON.parse(readFileSync(PICKS, 'utf8')) as Record<string, number>) : {};
}

// Gentle mode (default): the Intel iGPU driver times out on long kernels and can freeze the whole
// machine (LiveKernelEvent 141). One image per job, smaller renders, tiled VAE decoding and a pause
// after every image keep each GPU kernel short. COMFY_GENTLE=0 restores full-size batched renders.
const GENTLE = process.env.COMFY_GENTLE !== '0';
const COOLDOWN_MS = Number(process.env.COMFY_COOLDOWN_MS ?? 8000);
const snap64 = (v: number) => Math.max(512, Math.round(v / 64) * 64);

function renderSize(spec: AssetSpec): { width: number; height: number } {
  if (!GENTLE) return { width: spec.width, height: spec.height };
  const f = spec.width >= 1024 || spec.height >= 1024 ? 0.875 : 0.92;
  return { width: snap64(spec.width * f), height: snap64(spec.height * f) };
}

function workflow(spec: AssetSpec, seed: number) {
  const { width, height } = renderSize(spec);
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: spec.prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['4', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: GENTLE ? 1 : spec.candidates } },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 6,
        cfg: 2,
        sampler_name: 'dpmpp_sde',
        scheduler: 'karras',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': GENTLE
      ? { class_type: 'VAEDecodeTiled', inputs: { samples: ['3', 0], vae: ['4', 2], tile_size: 384, overlap: 64, temporal_size: 64, temporal_overlap: 8 } }
      : { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: `contaminant/${spec.path.replace('/', '_')}`, images: ['8', 0] } },
  };
}

async function comfyUp(): Promise<boolean> {
  try {
    return (await fetch(`${COMFY}/system_stats`)).ok;
  } catch {
    return false;
  }
}

interface HistoryImage {
  filename: string;
  subfolder: string;
  type: string;
}

async function queueAndFetch(spec: AssetSpec, seed: number): Promise<Buffer[]> {
  const r = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow(spec, seed), client_id: 'contaminant-assetgen' }) });
  if (!r.ok) throw new Error(`queue failed: ${r.status} ${await r.text()}`);
  const { prompt_id } = (await r.json()) as { prompt_id: string };
  const images = await waitFor(prompt_id);
  const out: Buffer[] = [];
  for (const im of images) {
    const q = new URLSearchParams({ filename: im.filename, subfolder: im.subfolder, type: im.type });
    out.push(Buffer.from(await (await fetch(`${COMFY}/view?${q}`)).arrayBuffer()));
  }
  return out;
}

async function render(spec: AssetSpec): Promise<void> {
  const seed = hash(spec.path) % 2 ** 31;
  const t0 = performance.now();
  const bufs: Buffer[] = [];
  if (GENTLE) {
    for (let k = 0; k < spec.candidates; k++) {
      bufs.push(...(await queueAndFetch(spec, (seed + k * 7919) % 2 ** 31)));
      await new Promise((res) => setTimeout(res, COOLDOWN_MS));
    }
  } else bufs.push(...(await queueAndFetch(spec, seed)));
  bufs.forEach((buf, k) => {
    const f = rawFile(spec, k);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, buf);
  });
  console.log(`  ${spec.path}: ${bufs.length} image(s) in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

const CUTOUT_KINDS = new Set<AssetSpec['kind']>(['token', 'prop', 'item', 'objective']);

async function waitFor(promptId: string): Promise<HistoryImage[]> {
  for (;;) {
    await new Promise((res) => setTimeout(res, 800));
    const h = (await (await fetch(`${COMFY}/history/${promptId}`)).json()) as Record<string, { outputs: Record<string, { images?: HistoryImage[] }>; status?: { status_str: string } }>;
    const entry = h[promptId];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error('ComfyUI reported an error');
    const images = Object.values(entry.outputs).flatMap((o) => o.images ?? []);
    if (images.length) return images;
  }
}

/** Background removal with ComfyUI's BiRefNet (clean even between legs and under arms). */
async function cutout(src: string, dst: string): Promise<void> {
  const form = new FormData();
  const name = `cg_${hash(src).toString(16)}.png`;
  form.append('image', new Blob([readFileSync(src)], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  const up = await fetch(`${COMFY}/upload/image`, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`upload failed: ${up.status}`);
  const wf = {
    '1': { class_type: 'LoadImage', inputs: { image: name } },
    '2': { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: 'birefnet.safetensors' } },
    '3': { class_type: 'RemoveBackground', inputs: { bg_removal_model: ['2', 0], image: ['1', 0] } },
    '4': { class_type: 'InvertMask', inputs: { mask: ['3', 0] } },
    '5': { class_type: 'JoinImageWithAlpha', inputs: { image: ['1', 0], alpha: ['4', 0] } },
    '6': { class_type: 'SaveImage', inputs: { filename_prefix: 'contaminant/cut', images: ['5', 0] } },
  };
  const r = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'contaminant-assetgen' }) });
  if (!r.ok) throw new Error(`cutout queue failed: ${r.status} ${await r.text()}`);
  const [im] = await waitFor(((await r.json()) as { prompt_id: string }).prompt_id);
  const q = new URLSearchParams({ filename: im!.filename, subfolder: im!.subfolder, type: im!.type });
  writeFileSync(dst, Buffer.from(await (await fetch(`${COMFY}/view?${q}`)).arrayBuffer()));
}

async function post(specs: AssetSpec[]): Promise<void> {
  const pk = picks();
  const comfy = await comfyUp();
  const jobs: { src: string; dst: string; kind: string; box: number }[] = [];
  for (const s of specs) {
    let src = rawFile(s, Math.min(pk[s.path] ?? 0, s.candidates - 1));
    if (!existsSync(src)) continue;
    if (CUTOUT_KINDS.has(s.kind)) {
      const cut = src.replace(/\.png$/, '.cut.png');
      if (!existsSync(cut) || force) {
        if (!comfy) {
          console.error(`  ! ${s.path}: ComfyUI offline, cannot cut out`);
          continue;
        }
        await cutout(src, cut);
      }
      src = cut;
    }
    jobs.push({ src, dst: join(OUT, `${s.path}.webp`), kind: s.kind, box: BOX[s.kind] });
  }
  for (const j of jobs) mkdirSync(dirname(j.dst), { recursive: true });
  if (!jobs.length) return;
  // jobs go through a file: the Windows venv launcher does not forward piped stdin reliably
  const jobFile = join(RAW, '.jobs.json');
  mkdirSync(RAW, { recursive: true });
  writeFileSync(jobFile, JSON.stringify(jobs));
  const res = spawnSync(PY, ['-I', join(here, 'post.py'), '--jobs', jobFile], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`post-processing failed:\n${res.stderr}`);
  console.log(`  post-processed ${jobs.length} asset(s)`);
}

function contactSheets(specs: AssetSpec[]): void {
  const groups = new Map<string, string[]>();
  for (const s of specs) {
    const files = Array.from({ length: s.candidates }, (_, k) => rawFile(s, k)).filter((f) => existsSync(f));
    const g = s.path.split('/')[0]!;
    groups.set(g, [...(groups.get(g) ?? []), ...files]);
  }
  for (const [g, files] of groups) {
    for (let i = 0; i < files.length; i += 36) {
      const out = join(RAW, `sheet_${g}_${i / 36}.png`);
      spawnSync(PY, ['-I', join(here, 'post.py'), '--sheet', out, `${g} ${i / 36}`, ...files.slice(i, i + 36)], { stdio: 'inherit' });
      console.log(`  sheet ${out}`);
    }
  }
}

const specs = catalog().filter((s) => !only || only.some((o) => s.path.startsWith(o)));

if (flag('check')) {
  const missing = specs.filter((s) => !existsSync(join(OUT, `${s.path}.webp`)));
  console.log(`${specs.length - missing.length}/${specs.length} assets present; ComfyUI ${(await comfyUp()) ? 'reachable' : 'offline'} at ${COMFY}`);
  for (const m of missing.slice(0, 20)) console.log(`  missing ${m.path}`);
  process.exit(0);
}

if (flag('sheet')) {
  contactSheets(specs);
  process.exit(0);
}

if (!flag('post-only')) {
  if (!(await comfyUp())) {
    console.error(`ComfyUI is not reachable at ${COMFY}. Start it (run_intel_gpu.bat) and retry.`);
    process.exit(1);
  }
  const todo = specs.filter((s) => force || !existsSync(rawFile(s, 0)));
  console.log(`generating ${todo.length} of ${specs.length} assets via ${COMFY}`);
  for (const [i, s] of todo.entries()) {
    console.log(`[${i + 1}/${todo.length}] ${s.path}`);
    try {
      await render(s);
      await post([s]);
    } catch (e) {
      console.error(`  ! ${(e as Error).message}`);
    }
  }
} else {
  await post(specs);
}
const n = writeManifest(OUT);
console.log(`manifest: ${n} file(s)`);
