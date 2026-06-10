# Handheld Shell UX

Lorekeeper should feel like a handheld campaign console for AI-assisted D&D play.

The provider is the engine behind the screen. Lorekeeper is the shell around it.

## Layout

- Top bar: campaign name, provider status, current scene/location, save/sync status.
- Left panel: party, HP/status, campaign controls, bridge controls.
- Center: Lorekeeper-owned play screen that mirrors imported provider responses.
- Right panel: people, places, inventory, quests, relationships, and combat state.
- Bottom: Lorekeeper-owned input box.

## Input Ownership

The user types into Lorekeeper, not directly into ChatGPT, Claude, or another provider.

Lorekeeper then:

1. receives the raw player action/message
2. builds a focused context pack from local storage
3. renders a provider-ready prompt
4. sends or copies the prompt through the selected provider bridge
5. imports the provider response
6. displays the response in the center play screen
7. extracts proposed state changes
8. shows a reviewable canon/state diff
9. saves approved updates to the local SQLite campaign file

## Provider Surface

Do not assume iframe embedding is possible. Many providers block iframe use.

Supported UX modes:

- provider tab/window controlled through extension bridge
- Lorekeeper app tab mirroring/importing provider responses into its own center panel
- optional split-window workflow where the provider is open beside Lorekeeper

The important behavior is that Lorekeeper owns input and campaign state even when the actual model
response is generated in a separate provider tab.

## Visual Direction

The layout can borrow from a Game Boy Advance mental model:

- a strong central screen
- side controls and status panels
- tactile bottom input
- compact, glanceable campaign state

This should feel like a campaign device, not a generic chat wrapper.

