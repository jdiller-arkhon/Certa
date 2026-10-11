/**
 * Validates an uploaded binary glTF (GLB 2.0) before it's stored. Rejects anything that isn't
 * a well-formed GLB, and any model that references external files or URLs — the hangar would
 * otherwise fetch them in every viewer's browser.
 */
export interface GlbInfo {
  meshes: number;
  nodes: number;
  generator: string | null;
}

export class GlbError extends Error {}

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

export function inspectGlb(buf: Uint8Array): GlbInfo {
  if (buf.byteLength < 20) throw new GlbError('File is too small to be a GLB model');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new GlbError('Not a GLB file (export as binary glTF, .glb)');
  if (dv.getUint32(4, true) !== 2) throw new GlbError('Only glTF 2.0 models are supported');
  if (dv.getUint32(8, true) !== buf.byteLength) throw new GlbError('GLB length header does not match the file (truncated upload?)');
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLen > buf.byteLength) throw new GlbError('GLB is missing its JSON chunk');
  let gltf: { asset?: { version?: string; generator?: string }; buffers?: { uri?: string }[]; images?: { uri?: string }[]; meshes?: unknown[]; nodes?: unknown[]; extensionsRequired?: string[] };
  try {
    gltf = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  } catch {
    throw new GlbError('GLB JSON chunk is not valid JSON');
  }
  if (!gltf.asset?.version?.startsWith('2.')) throw new GlbError('Only glTF 2.0 models are supported');
  const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].some((x) => typeof x.uri === 'string' && !x.uri.startsWith('data:'));
  if (external) throw new GlbError('The model references external files. Export it as a single self-contained .glb');
  if (!gltf.meshes?.length) throw new GlbError('The model has no meshes');
  // Draco/meshopt need decoders the hangar doesn't load.
  const unsupported = (gltf.extensionsRequired ?? []).filter((e) => e === 'KHR_draco_mesh_compression' || e === 'EXT_meshopt_compression');
  if (unsupported.length) throw new GlbError(`Compressed models aren’t supported yet (${unsupported.join(', ')}). Export without mesh compression`);
  return { meshes: gltf.meshes.length, nodes: gltf.nodes?.length ?? 0, generator: gltf.asset.generator ?? null };
}
