import { calibrateExecutorScene } from "../scenes/package/scene-calibration.js";
import { validateSceneBlueprint } from "../scenes/scene-blueprint-validator.js";
import { inspectExecutorSceneGeometry } from "../scenes/package/executor-scene-geometry.js";
import { auditNativeActor } from "./native-export-audit.js";

// This prepares a TEST package only; it never calls Foundry or modifies a document.
export function prepareM00({ blueprint, asset, actors, confirmedByGM = false }) {
  const b = structuredClone(blueprint);
  if (b.schemaVersion !== "1.0" || !b.scene?.name?.startsWith("TESTE - M00 "))
    throw new Error("M00 exige Scene V1 e nome TESTE - M00 único.");
  if (b.scene.visionPreset !== undefined) throw new Error("Não substituir visão dos protótipos por preset.");
  if (b.scene.columns !== 30 || b.scene.rows !== 24 || b.scene.grid?.size !== 100
    || b.scene.grid.distance !== 5 || b.scene.grid.units !== "ft")
    throw new Error("Configuração provisória aprovada: 30x24, 100px, 5ft.");
  if (!asset || asset.id !== "m00-reference" || !asset.dataBase64 || asset.mimeType !== "image/jpeg")
    throw new Error("Forneça o JPG real da referência M00; placeholder não é asset.");
  const audits = actors.map(a=>auditNativeActor(a, {confirmedByGM}));
  if (audits.some(a=>a.issues.length)) throw new Error("Exports ou confirmação pendentes.");
  const names = actors.map(a=>a.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new Error("Nomes ambíguos de Actors.");
  for (const token of b.tokens ?? []) {
    const a = actors.find(a=>a.name === token.actor);
    if (!a) throw new Error(`Actor não conferido: ${token.actor}`);
    if (token.vision !== undefined || token.texture !== undefined || token.actorId || token.actorUuid)
      throw new Error("Token deve herdar visão/textura do Actor do mundo de teste, sem UUID de produção.");
    if (token.width !== a.prototypeToken.width || token.height !== a.prototypeToken.height)
      throw new Error(`Escala divergente do export: ${a.name}`);
  }
  const {blueprint:calibrated} = calibrateExecutorScene(b);
  validateSceneBlueprint(calibrated);
  const geometry = inspectExecutorSceneGeometry(calibrated);
  if (geometry.errors.length) throw new Error(geometry.errors.join("; "));
  const tokens = calibrated.tokens ?? [];
  if (tokens.some(t=>t.x+t.width>30 || t.y+t.height>24)) throw new Error("Token ultrapassa a cena.");
  if ((calibrated.lights ?? []).some(l=>l.bright>l.dim)) throw new Error("Luz bright maior que dim.");
  for (let i=0;i<tokens.length;i++) for (let j=i+1;j<tokens.length;j++) {
    const a=tokens[i], c=tokens[j];
    if (a.x<c.x+c.width && a.x+a.width>c.x && a.y<c.y+c.height && a.y+a.height>c.y)
      throw new Error("Sobreposição inicial de tokens.");
  }
  const pkg = {schemaVersion:"jarvis-executor-1", name:b.scene.name,
    assets:[structuredClone(asset)], actors:[], scenes:[b], itemAdditions:[]};
  return {pkg, calibrated, report:{status:"RASCUNHO_TECNICO_NAO_HD", geometryWarnings:geometry.warnings,
    finalReady:false, productionAllowed:false, newAbilitiesInstalled:false,
    pending:["Arte HD aprovada", "Geometria e portas na prévia", "Visão, colisão e manobra no Foundry V14", "NPCs aprovados"]}};
}
