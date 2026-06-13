import { controllerForActor } from "./agency-controller.js";
import { getActiveCombatActor } from "./combat-engine.js";
import { deriveTurnUiState } from "./turn-engine.js";

export function deriveUiState({ campaign, turnState }) {
  const turn = deriveTurnUiState(turnState);
  const activeCombatActor = campaign?.combat?.inCombat ? getActiveCombatActor(campaign) : null;
  const activeActorId = activeCombatActor?.id ?? turn.activeActorId;
  const controller = activeActorId ? controllerForActor(campaign, activeActorId) : null;
  return {
    mode: campaign?.combat?.inCombat ? "combat" : turn.mode,
    turn,
    activeActor: activeActorId
      ? {
          id: activeActorId,
          name: activeCombatActor?.name ?? labelForActor(campaign, activeActorId),
          controller,
        }
      : null,
    canSend: turn.canSend && (!campaign?.combat?.inCombat || controller?.kind === "host" || controller?.kind === "remote_player"),
    sendDisabledReason: turn.disabledReason || combatDisabledReason(campaign, controller),
    combatPanel: campaign?.combat?.inCombat
      ? {
          round: campaign.combat.round,
          currentTurnId: campaign.combat.currentTurnId,
          turnOrder: campaign.combat.turnOrder ?? [],
        }
      : null,
  };
}

function combatDisabledReason(campaign, controller) {
  if (!campaign?.combat?.inCombat) return "";
  if (!controller) return "No active combat actor.";
  if (controller.kind === "npc_dm") return "DM-controlled combatant is acting.";
  if (controller.kind === "ai_companion") return "AI companion action needs suggestion or approval.";
  return "";
}

function labelForActor(campaign, actorId) {
  return [...(campaign?.party ?? []), ...(campaign?.people ?? []), ...(campaign?.combat?.enemies ?? [])]
    .find((item) => item.id === actorId)?.name ?? actorId;
}
