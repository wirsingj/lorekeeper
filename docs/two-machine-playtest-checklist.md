# LoreKeeper Two-Machine Playtest Checklist

Date target: first local network playtest.

Goal: make the session feel like a small real D&D table. The host runs LoreKeeper and the DM. The guest runs ThinLoreKeeper and controls one party character. Do not debug in front of the guest unless play is blocked.

## Before She Joins

1. Start Full LoreKeeper on the host machine.
2. Open the campaign you want to show.
3. In Setup, confirm:
   - Local AI/provider is ready.
   - Debug meta in play log is off.
   - Local Table is off until you are ready to invite.
4. Create or confirm the host character.
5. Add any AI companions before inviting the guest.
6. Start Local Table.
7. Copy either:
   - a Join-As link if she is bringing a new character, or
   - a specific character invite if she is claiming an existing party member.

## Guest Join Flow

1. Open ThinLoreKeeper on the guest machine.
2. Paste the invite link.
3. Preview should show the campaign, party, and public situation without hidden DM notes.
4. Have her enter:
   - player/table name
   - character name
   - ancestry/class or a short concept
   - why the character is here
5. Use Auto-Complete if she wants help.
6. Submit join request.
7. Host approves the request.
8. Confirm the guest sees the table and can identify her character.

## First Five-Minute Table Script

1. Host sends a simple in-world action.
2. Confirm the main Waiting For strip says the DM is thinking.
3. Confirm the DM answers without raw provider meta under the bubble.
4. Guest sends one character action.
5. Confirm host sees it staged or queued in clear table language.
6. Resolve the guest action.
7. Confirm the guest sees the result and does not need to understand provider/import/retry language.
8. Use Table Talk once from each machine.
9. Start a small danger or combat scene only after the basic loop works.

## Combat Smoke Test

1. Start with 2-4 enemies, not one huge monster.
2. Confirm every enemy has its own row in initiative.
3. On a host-controlled character turn, the host input box should invite that character's action.
4. On a guest-controlled character turn, the host should wait for the guest action instead of acting for them.
5. Resolve one actor at a time.
6. Check visible rolls, damage, HP changes, and turn advancement.
7. Try one nonlethal ending: surrender, retreat, or de-escalation.

## Recovery Smoke Test

1. If the DM response fails, do not immediately retry silently.
2. Confirm the Waiting For strip says the DM response needs review.
3. Confirm the original player/guest input remains visible as staged or submitted.
4. Use Try Again first.
5. Use Details if you need to inspect what happened.
6. Use Use Anyway only if the narration is acceptable and you understand the risk.

## Stop Conditions

Pause the test and write a note if any of these happen:

1. The DM speaks or acts for the guest character without submitted input.
2. The guest cannot tell whether her action was sent.
3. The host cannot tell whose turn it is.
4. Combat advances past more than one actor in a single response.
5. Hidden story/debug/meta text appears in the guest view.
6. A failed provider turn leaves the table unsure what to do next.
