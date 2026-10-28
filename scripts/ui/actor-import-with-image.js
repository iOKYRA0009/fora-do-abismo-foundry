import { validateJarvisActorPayload } from "../importer/validators/payload-validator.js";

const IMAGE_MIMES = Object.freeze({
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"
});
const IMAGE_DIRECTORY = "jarvis-actor-images";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** FilePicker in Foundry V14 lives in foundry.applications.apps. */
function filePicker() {
  return globalThis.foundry?.applications?.apps?.FilePicker ?? globalThis.FilePicker;
}

/**
 * Uploads one optional portrait to Foundry user data, without overwriting an
 * existing image. No Actor or existing files are modified by the upload.
 */
export async function uploadJarvisActorImage(file, { picker = filePicker() } = {}) {
  if (!file) return null;
  const ext = IMAGE_MIMES[file.type];
  if (!ext || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Retrato: use PNG, JPG ou WebP de até 6 MB.");
  }
  if (!picker?.browse || !picker?.createDirectory || !picker?.upload) {
    throw new Error("O upload de retratos exige FilePicker do Foundry V14.");
  }

  try {
    await picker.browse("data", IMAGE_DIRECTORY);
  } catch (_missing) {
    try { await picker.createDirectory("data", IMAGE_DIRECTORY); }
    catch (creationError) {
      // A concurrent upload might have created the directory already.
      try { await picker.browse("data", IMAGE_DIRECTORY); }
      catch { throw creationError; }
    }
  }

  const nonce = globalThis.foundry?.utils?.randomID?.(12)
    ?? Math.random().toString(36).slice(2, 14);
  const uniqueName = `jarvis-${Date.now()}-${nonce}.${ext}`;
  const uploadFile = new File([file], uniqueName, { type: file.type });
  const uploaded = await picker.upload("data", IMAGE_DIRECTORY, uploadFile, {}, { notify: false });
  if (uploaded?.error || uploaded?.success === false) {
    throw new Error(`Retrato: falha no upload para Foundry (${uploaded.error ?? "sem detalhes"}).`);
  }
  const path = String(uploaded?.path ?? "");
  if (!path.startsWith(`${IMAGE_DIRECTORY}/`) || !path.endsWith(uniqueName)) {
    throw new Error("Retrato: o Foundry não confirmou o caminho do arquivo enviado.");
  }
  return path;
}

/**
 * Validates the entire V9 payload before uploading its optional portrait.
 * Leaves imported Items and Activities to the transaction-safe V9 importer.
 */
export async function importJarvisActorWithImage(jsonText, {
  imageFile = null, importer, picker = filePicker(), renderSheet = true
} = {}) {
  if (!importer?.importActor) throw new Error("Jarvis Importer V9 indisponível.");
  let payload;
  try { payload = JSON.parse(jsonText); }
  catch (error) { throw new Error(`JSON V9 inválido: ${error.message}`); }
  validateJarvisActorPayload(payload);

  // Never mutate the caller's payload while applying the imported portrait.
  const copy = structuredClone(payload);
  if (imageFile) {
    const imagePath = await uploadJarvisActorImage(imageFile, { picker });
    copy.actor.img = imagePath;
    delete copy.actor.imgStrategy;
    copy.actor.prototypeToken ??= {};
    copy.actor.prototypeToken.texture ??= {};
    copy.actor.prototypeToken.texture.src = imagePath;
  }
  return importer.importActor(copy, { renderSheet });
}
