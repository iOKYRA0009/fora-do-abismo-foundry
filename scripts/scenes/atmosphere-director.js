/**
 * A small native Foundry GM director deck. These are authored original cues,
 * not third-party FXMaster/Sequencer API calls. No actors, walls, tokens,
 * images or ambient lights are changed by these cues.
 */
const saved = new WeakMap();
export const ATMOSPHERE_CUES = Object.freeze({
  solemn: { label:"Liturgia velada", darkness:0.58, background:"#15111f",
    intent:"A falsa serenidade de uma cerimônia pública." },
  hunger: { label:"Fome silenciosa", darkness:0.82, background:"#100a18",
    intent:"O público ainda celebra, mas o ambiente parece absorver a alegria." },
  rupture: { label:"Ruptura", darkness:0.94, background:"#10070b",
    intent:"A ordem cede à instabilidade; usar somente quando a cena justificar." }
});
function gmScene(scene) {
  if (!globalThis.game?.user?.isGM) throw new Error("Jarvis Diretor: apenas o Mestre pode controlar a atmosfera.");
  if (!scene || scene.documentName !== "Scene" || !scene.id || typeof scene.update !== "function") {
    throw new Error("Jarvis Diretor: abra uma Scene válida.");
  }
}
function env(scene) {
  return {darkness:scene.environment?.darknessLevel ?? 0,background:scene.backgroundColor??"#000000"};
}
export function listAtmosphereCues() {
  return Object.entries(ATMOSPHERE_CUES).map(([key,v])=>({key,label:v.label,intent:v.intent}));
}
export function previewAtmosphereCue(scene,key) {
  gmScene(scene);
  const cue = ATMOSPHERE_CUES[key];
  if (!cue) throw new Error("Jarvis Diretor: estado desconhecido.");
  return {sceneId:scene.id,sceneName:scene.name,key,from:env(scene),
    to:{darkness:cue.darkness,background:cue.background}, intent:cue.intent,
    modifies:["environment.darknessLevel","backgroundColor"], mode:"preview"};
}
export async function applyAtmosphereCue(scene,key) {
  const preview=previewAtmosphereCue(scene,key);
  if (!saved.has(scene)) saved.set(scene,{...preview.from});
  try {
    await scene.update({"environment.darknessLevel":preview.to.darkness,
      backgroundColor:preview.to.background});
  } catch (error) {
    // Keep the original pre-cue state available for manual recovery.
    throw new Error(`Jarvis Diretor: não foi possível aplicar ambiente: ${error.message}`, {cause:error});
  }
  return {...preview, mode:"applied",restoreAvailable:true};
}
export async function restoreAtmosphereCue(scene) {
  gmScene(scene);
  const original=saved.get(scene);
  if (!original) throw new Error("Jarvis Diretor: não há estado anterior nesta sessão do Jarvis. Nenhuma alteração foi feita.");
  await scene.update({"environment.darknessLevel":original.darkness,
    backgroundColor:original.background});
  saved.delete(scene);
  return {sceneId:scene.id, restored:original, mode:"restored"};
}
