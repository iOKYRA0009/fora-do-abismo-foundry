import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { auditNativeActor, scalingCSV } from "../scripts/preparation/native-export-audit.js";
import { prepareM00 } from "../scripts/preparation/m00-package.js";

// Explicit paths only. No search of the world, no network, no publication of exports.
const [configPath, outPath] = process.argv.slice(2);
if (!configPath || !outPath) {
  console.error("Uso: node tools/prepare-m00.mjs CONFIG_PRIVADO.json NOVA_PASTA_DE_SAIDA"); process.exitCode=1;
} else {
  try {
    const config = JSON.parse(await fs.readFile(configPath,"utf8"));
    const base = path.dirname(path.resolve(configPath));
    const read = async f=>fs.readFile(path.resolve(base,f));
    const actors=[], audits=[], sources=[];
    for (const entry of config.actors) {
      const bytes=await read(entry.file), actor=JSON.parse(bytes.toString("utf8"));
      if (actor.name !== entry.expectedName) throw new Error(`Nome diverge do manifest: ${entry.expectedName}`);
      actors.push(actor);
      audits.push(auditNativeActor(actor,{fileName:path.basename(entry.file),confirmedByGM:entry.confirmedByGM === true}));
      sources.push({file:path.basename(entry.file),sha256:createHash("sha256").update(bytes).digest("hex")});
    }
    const outputs={"TABELA_SCALING_V53.csv":scalingCSV(audits.map(a=>a.row)),
      "RELATORIO_RECURSOS_PJS.json":JSON.stringify(audits,null,2),
      "FONTES_SHA256.json":JSON.stringify(sources,null,2)};
    if (config.blueprint && config.map) {
      const map = await read(config.map);
      if (map.length>8*1024*1024 || map[0]!==255 || map[1]!==216 || map[2]!==255)
        throw new Error("Mapa deve ser JPG real de até 8 MB.");
      const result=prepareM00({blueprint:JSON.parse((await read(config.blueprint)).toString("utf8")),
        asset:{id:"m00-reference",fileName:"M00_REFERENCIA_OFICIAL.jpg",mimeType:"image/jpeg",dataBase64:map.toString("base64")},
        actors,confirmedByGM:config.actors.every(a=>a.confirmedByGM === true)});
      outputs["M00_RASCUNHO_EXECUTOR.json"]=JSON.stringify(result.pkg,null,2);
      outputs["M00_PREFLIGHT.json"]=JSON.stringify(result.report,null,2);
    }
    // Refuse reuse: a failed/repeated run cannot clobber a reviewed package.
    await fs.mkdir(outPath,{recursive:false});
    for (const [name,body] of Object.entries(outputs)) await fs.writeFile(path.join(outPath,name),body,{flag:"wx"});
    console.log(`Preparação offline concluída: ${Object.keys(outputs).length} arquivos. Arte final/Foundry pendentes.`);
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
