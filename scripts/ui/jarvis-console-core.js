/** Access rules shared by the Jarvis window and its action handlers. */
export function getJarvisAccess(user, actor = null) {
  const gm = Boolean(user?.isGM);
  const trustedRole = globalThis.CONST?.USER_ROLES?.TRUSTED ?? 2;
  const trusted = !gm && Number(user?.role ?? 0) >= trustedRole;
  const canViewActor = gm || Boolean(actor?.testUserPermission?.(user, "OBSERVER"));
  const canManageActor = gm || (trusted && Boolean(actor?.testUserPermission?.(user, "OWNER")));
  return { gm, trusted, player: Boolean(user) && !gm, canViewActor, canManageActor };
}

export function visibleJarvisTabs(access) {
  if (!access?.gm && !access?.player) return [];
  if (access?.gm) {
    return ["characters", "content", "maps", "appearances", "compendiums", "diagnostics", "players", "macros"];
  }
  return ["characters", "appearances", "compendiums", "players"];
}

export function assertJarvisAccess(condition, message = "Jarvis: você não tem permissão para esta ação.") {
  if (!condition) throw new Error(message);
}
