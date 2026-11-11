import { approveActivityAutomations, listActivityAutomations } from "./automation-approval.js";

const MODULE_ID = "fora-do-abismo-foundry";
const SETTING_KEY = "allowPlayerJarvisAbilities";

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return typeof collection.values === "function" ? Array.from(collection.values()) : [];
}

function playerCharacterActors() {
  const players = values(game.users).filter(user => !user.isGM);
  const eligible = actor => actor && (actor.type === "character"
    || players.some(user => actor.testUserPermission?.(user, "OWNER")));
  const worldActors = values(game.actors);
  const tokenActors = values(game.scenes).flatMap(scene => values(scene.tokens)
    .filter(token => token.actor && !token.actorLink)
    .map(token => token.actor));
  return Array.from(new Set([...worldActors, ...tokenActors].filter(eligible)));
}

function requireActiveGm() {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
    throw new Error("Apenas o Mestre ativo pode alterar o uso de habilidades Jarvis pelos jogadores.");
  }
}

export function registerPlayerAbilitySetting() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Permitir habilidades Jarvis aos jogadores",
    hint: "Ao ligar, o Mestre autoriza as automações atuais dos personagens; importações posteriores também são autorizadas. Scripts executam com as permissões do jogador.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

export function playerAbilitiesEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTING_KEY) === true;
  } catch {
    return false;
  }
}

export async function setPlayerAbilitiesEnabled(enabled) {
  requireActiveGm();
  const report = enabled === true
    ? await approveActivityAutomations(
      playerCharacterActors().flatMap(actor => listActivityAutomations(actor.items)),
      { skipInvalid: true }
    )
    : { approved: 0, skipped: 0 };
  requireActiveGm();
  await game.settings.set(MODULE_ID, SETTING_KEY, enabled === true);
  return { enabled: playerAbilitiesEnabled(), ...report };
}
