const MODULE_ID = "fora-do-abismo-foundry";
const SETTING_KEY = "approvedActivityAutomations";
const MAX_AUTOMATION_BYTES = 128 * 1024;
let approvalWriteQueue = Promise.resolve();

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}

// Synchronous SHA-256 is needed because dnd5e.preUseActivity is synchronous.
// Store only a digest in the world setting; scripts from private Items must not
// be copied into a setting that Foundry may synchronize to player clients.
export function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = words[i - 15];
      const b = words[i - 2];
      const sigma0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const sigma1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[i] = (words[i - 16] + sigma0 + words[i - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const choice = (e & f) ^ (~e & g);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const temp1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[i] + words[i]) >>> 0;
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map(part => part.toString(16).padStart(8, "0")).join("");
}

function canonicalJson(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("Automação cíclica não pode ser aprovada.");
    seen.add(value);
    const result = `[${value.map(entry => canonicalJson(entry, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error("Automação precisa conter apenas dados JSON comuns.");
    }
    if (seen.has(value)) throw new Error("Automação cíclica não pode ser aprovada.");
    seen.add(value);
    const result = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`).join(",")}}`;
    seen.delete(value);
    return result;
  }
  throw new Error("Automação precisa conter apenas dados JSON comuns.");
}

function getIdentity(activity) {
  const activityUuid = String(activity?.uuid ?? "").trim();
  const itemUuid = String(activity?.item?.uuid ?? "").trim();
  if (!activityUuid || !itemUuid || !activityUuid.startsWith(`${itemUuid}.`)) return null;
  return { activityUuid, itemUuid, key: `${itemUuid}|${activityUuid}` };
}

function getAutomation(activity) {
  return activity?.flags?.[MODULE_ID]?.automation ?? null;
}

function digestActivity(activity) {
  const automation = getAutomation(activity);
  if (!automation || typeof automation !== "object" || Array.isArray(automation)) {
    throw new Error("Automação precisa ser um objeto JSON.");
  }
  const effectsCollection = activity.item?.effects;
  const effects = effectsCollection ? Array.from(effectsCollection.contents ?? effectsCollection) : [];
  const canonicalEffects = effects.map(effect => canonicalJson(effect.toObject?.() ?? effect)).sort();
  // Scripts can call jarvis.applyEmbeddedEffect() without declaring an effect
  // in automation.effects. Bind every embedded source Effect to the approval.
  const canonical = canonicalJson({ automation, embeddedEffects: canonicalEffects });
  if (new TextEncoder().encode(canonical).length > MAX_AUTOMATION_BYTES) {
    const error = new Error("Automação ultrapassa o limite de 128 KiB.");
    error.code = "too-large";
    throw error;
  }
  return sha256Text(canonical);
}

function getStoredApprovals() {
  try {
    const value = game.settings?.get?.(MODULE_ID, SETTING_KEY);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function requireActiveGm() {
  const user = game.user;
  if (!user?.isGM || !user.id || game.users?.activeGM?.id !== user.id) {
    throw new Error("Apenas o Mestre ativo pode aprovar automações Jarvis.");
  }
}

function updateApprovals(mutator) {
  const operation = approvalWriteQueue.then(async () => {
    requireActiveGm();
    const approvals = getStoredApprovals();
    if (!approvals) throw new Error("Setting de aprovações Jarvis indisponível.");
    const next = { ...approvals };
    await mutator(next);
    await game.settings.set(MODULE_ID, SETTING_KEY, next);
  });
  approvalWriteQueue = operation.catch(() => {});
  return operation;
}

export function registerActivityAutomationSettings() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Automações de Activity aprovadas pelo Mestre",
    hint: "Hashes de automações aprovadas explicitamente; não contém o código.",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
}

export function inspectActivityAutomation(activity) {
  const identity = getIdentity(activity);
  if (!identity) return { approved: false, reason: "unstable-uuid" };
  const automation = getAutomation(activity);
  if (!automation) return { ...identity, approved: false, reason: "no-automation" };
  let digest;
  try {
    digest = digestActivity(activity);
  } catch (error) {
    return { ...identity, approved: false, reason: error.code === "too-large" ? "too-large" : "invalid-automation" };
  }
  const approvals = getStoredApprovals();
  if (!approvals) return { ...identity, approved: false, reason: "settings-unavailable" };
  const approved = Object.hasOwn(approvals, identity.key) && approvals[identity.key] === digest;
  return { ...identity, approved, reason: approved ? "approved" : "approval-required" };
}

export async function approveActivityAutomation(activity) {
  requireActiveGm();
  const identity = getIdentity(activity);
  if (!identity) throw new Error("Activity e Item precisam de UUIDs estáveis para aprovação.");
  const automation = getAutomation(activity);
  if (!automation) throw new Error("Activity sem automação Jarvis para aprovar.");
  const digest = digestActivity(activity);
  await updateApprovals(next => {
    // An edit while a previous approval is being saved must not authorize
    // stale data or silently approve a newer, unreviewed script.
    if (digestActivity(activity) !== digest) {
      throw new Error("Automação alterada durante a aprovação. Revise e tente novamente.");
    }
    next[identity.key] = digest;
  });
  return inspectActivityAutomation(activity);
}

export async function revokeActivityAutomation(activity) {
  requireActiveGm();
  const identity = getIdentity(activity);
  if (!identity) throw new Error("Activity e Item precisam de UUIDs estáveis para revogar aprovação.");
  await updateApprovals(next => { delete next[identity.key]; });
  return inspectActivityAutomation(activity);
}
