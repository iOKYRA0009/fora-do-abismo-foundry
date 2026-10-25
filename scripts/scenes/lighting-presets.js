const PRESETS = Object.freeze({
  neutral: { label: "Neutro", darkness: 0.2, background: "#1e1b19", lightColor: "#f4d9a8", alpha: 0.35 },
  torch: { label: "Tochas", darkness: 0.75, background: "#100d0b", lightColor: "#e89646", alpha: 0.5,
    animation: { type: "torch", speed: 2, intensity: 2 } },
  cavern: { label: "Caverna", darkness: 0.88, background: "#0b1118", lightColor: "#83b4c7", alpha: 0.48 },
  ritual: { label: "Ritual", darkness: 0.82, background: "#170e1a", lightColor: "#b77dd8", alpha: 0.52,
    animation: { type: "pulse", speed: 2, intensity: 2 } }
});

export function listLightingPresets() {
  return Object.entries(PRESETS).map(([key, preset]) => ({ key, label: preset.label }));
}

export function applyLightingPreset(payload, key, { recolorExisting = false } = {}) {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`Perfil de luz desconhecido: ${key}.`);
  const result = structuredClone(payload);
  result.scene ??= {};
  result.scene.environment = { ...(result.scene.environment ?? {}), darknessLevel: preset.darkness };
  result.scene.backgroundColor = preset.background;
  if (recolorExisting) {
    result.lights = (result.lights ?? []).map(light => ({
      ...light,
      color: preset.lightColor,
      alpha: preset.alpha,
      ...(preset.animation ? { animation: { ...preset.animation } } : {})
    }));
  }
  result.metadata = { ...(result.metadata ?? {}), lightingPreset: key };
  return result;
}

export function lightFromPreset(key, x, y) {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`Perfil de luz desconhecido: ${key}.`);
  return {
    name: `Luz ${preset.label}`, x, y, dim: 30, bright: 15,
    color: preset.lightColor, alpha: preset.alpha,
    ...(preset.animation ? { animation: { ...preset.animation } } : {})
  };
}
