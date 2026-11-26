# Jarvis Synergy Engine — 1.6.2

Three stages are shipped together: turn economy, cooperative requests, visual editor.

## Quick start (Foundry V14 / D&D5e 6)
1. Enable Socketlib if participants are controlled by players. A GM must be connected.
2. Central Jarvis → Personagens → Sinergias Jarvis → Economia e editor de combos.
3. At combat start, click Iniciar economia. If enabled mid-combat, correct the balances already spent.
4. In Novo combo, enter a name. Row 1 = initiator, select other actors in rows 2–7, and set the cost of each.
   Example: Orgulho, action; Ira, reaction. Choose optional maximum distance in scene units and required status per participant.
5. Optionally load the initiator's Activities and select an existing native Activity. Leave blank for manual resolution.
6. Select availability: GM only by default, or initiator's owners. Save the combo.
7. Use Abrir combos with the active character (or the link control on a supported Actor sheet). Select and request the ability.
   The GM approves and the chosen active controller of each other player-controlled participant accepts.
   NPCs without player owners use GM approval. Offline player-owned participants cancel the request.

## Costs and authority
- Default 1 action, 1 bonus action, 1 reaction per combatant. All refresh at the start of that combatant's own turn, not at global round change.
- Action and bonus action normally require the participant's turn. A GM can explicitly allow an off-turn homebrew cost.
- The active GM is the sole writer. A private Journal contains definitions and the per-combat ledger. No backups or downloads are created.
- Player RPCs are restricted to the owner of the initiating actor; only authorized combo names/own costs are returned. No public boss HP or hidden combo list.
- A refusal, unavailable participant, range/status failure, changed combat or initiative, unavailable cost, or expired request prevents spending. All costs are saved in one document update.
- Native Activity use is opened on the GM client, with GM-selected targets; the normal D&D5e workflow handles the ability's resources, rolls and effects. If the Activity returns no result without changing turn, the cost ledger is restored. Unexpected partial failure requires GM review, not automatic retries.
- Notes/effects in the combo editor are private GM notes, not executable scripts. For automated damage etc., configure the native Activity beforehand.
- Successful ordinary native Activities with action/bonus/reaction activation and a verifiable usage message are recorded through the D&D5e postUseActivity hook. This is an auxiliary tracker, not a blanket interceptor of native actions or other modules. Extra Attack, movement, manually resolved actions, reactions with unconventional activation, additional actions and delayed/socketless uses can require GM adjustment.
- The GM may adjust the remaining balance 0–20. If initiative changes or goes backward, resynchronize; previously spent balances are preserved. Multiple combatants referencing the same world actor are rejected rather than guessing the token.
- No damage is rolled from the combo itself if no Activity is linked. Conditions include range, active combat presence, incapacitation, explicit required status, and costs.
- Consent expires after 45 seconds per stage. A late answer cannot commit a combo. Only one combo request is pending on the active GM at a time.
- Advanced sequences over multiple rounds, automatic economy enforcement in every external module and custom multi-actor resource currencies are not implemented.

## Technical validation
Node regression tests cover the rules, mock GM/player consent, concurrent action recording, visibility, native activation cancellation, and editor visibility. Actual multi-client Foundry testing remains necessary, including sheet layout, Socketlib and native Activity behavior.
