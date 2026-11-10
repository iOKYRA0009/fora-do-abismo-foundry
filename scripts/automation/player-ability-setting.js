const MODULE_ID = "fora-do-abismo-foundry";
const SETTING_KEY = "allowPlayerJarvisAbilities";

export function registerPlayerAbilitySetting() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Permitir habilidades Jarvis aos jogadores",
    hint: "Jogadores podem usar automações Jarvis aprovadas em personagens que controlam. Scripts executam com as permissões do jogador.",
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
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
    throw new Error("Apenas o Mestre ativo pode alterar o uso de habilidades Jarvis pelos jogadores.");
  }
  await game.settings.set(MODULE_ID, SETTING_KEY, enabled === true);
  return playerAbilitiesEnabled();
}
