---
yaiml: 0.2
role: supporting
title: LoreKeeper Remote Table Access Plan
purpose: Host/guest remote-access doctrine, guest-safe route boundaries, and future tunnel/relay direction.
belongs-here: host/guest product principles, remote/LAN guest access strategy, guest-safe route audit, invite/session safety doctrine, relay constraints.
not-here: implementation of a relay, provider/model setup details, generic architecture inventory, ordinary maintainer command reference.
durability: durable product/security doctrine; update when host/guest access strategy or route boundaries change.
read-with: LoreKeeper State Of The Table; LoreKeeper Architecture; LoreKeeper Maintainer Guide.
update-when: LAN guest model, remote sharing doctrine, guest-safe route policy, invite/session authority, or relay plans change.
agent-guidance: Preserve "the host can suffer; the guest cannot." Do not add relay/tunnel/VPN/provider code merely because this plan exists.
---

# LoreKeeper Remote Table Access Plan

## Purpose

LoreKeeper should let one host run the table, campaign state, and AI provider locally, while guests join with as little friction as possible.

The ideal experience is simple:

Host:

- Runs LoreKeeper.
- Owns the campaign state.
- Runs the DM brain through local Ollama or a provider API key.
- Starts a table session.
- Sends an invite link.

Guest:

- Clicks a Discord link.
- Opens a browser.
- Enters a name or chooses a character.
- Joins the table.

The guest should not need to install LoreKeeper, Ollama, Tailscale, Hamachi, a VPN, a model runtime, or any networking tool.

Core principle:

The host can suffer.
The guest cannot.

## Biggest Product Concern: Friend Code Remote Guest

The most important remote-access problem is not giving every guest a packaged app.

The winning guest experience is browser-only:

1. Host runs LoreKeeper locally.
2. Host clicks Share Remote Table.
3. LoreKeeper shows a short friend code such as `MOSS-7K4P`, plus an optional copyable browser link.
4. Guest opens a public LoreKeeper guest page.
5. Guest enters the friend code, chooses a name/seat/character draft, and waits for host approval.
6. Host approves the guest.
7. Guest plays in the browser.

Guests should not need a shared zip, Steam install, Itch download, Discord file, Google Drive link, Node, Ollama, VPN, Tailscale, Hamachi, tunnel client, or model runtime.

Distribution remains useful for hosts. Friend code is for guests.

Product split:

- Host distribution: portable zip now, maybe Itch/Steam/installer later.
- Guest access: public browser page plus friend code.

The friend code is product language. Internally it should map to an unguessable token and a live host/relay session.

Suggested alpha constraints:

- at most 5 guests per table,
- short-lived friend codes,
- explicit host approval,
- host can revoke/stop sharing at any time,
- no file uploads,
- small JSON payloads only,
- idle timeout,
- max session duration,
- guest-safe route/message allowlist,
- no campaign database or provider keys stored in the relay.

Multi-host principle:

- The relay is a shared bridge for a small number of simultaneous hosts.
- A host's local LoreKeeper app owns that host's campaign, table authority, Ollama/provider settings, and provider keys.
- The Cloudflare deploy token is developer/deployment infrastructure only. It must not ship inside LoreKeeper.
- A public relay URL may ship as app configuration because it is only the doorway.
- A friend code plus host/table label identifies a live relay room; it does not grant access to host settings, provider keys, Ollama, filesystem, diagnostics, or raw campaign storage.
- The host/table label is cosmetic URL language for humans. The friend code and internal host token are the security boundary.
- Do not hide a shared provider API key inside the app as a product strategy. Obfuscation is not a security boundary. Hosts should use Ollama or configure their own provider key unless a future paid/provisioned provider service exists with real server-side controls.

## Product Target

The long-term product sentence is:

"I host the table locally. My friends join from Discord with a browser link or friend code. My machine runs the DM brain."

That means LoreKeeper is one app with multiple access surfaces:

- Local host app
- Provider-backed host mode
- Browser guest mode
- Future relay-assisted remote guest mode

The separate "Thinclient" concept is retired. Guest mode is not a separate product. It is part of LoreKeeper.

## Current Reality

LAN guest mode already proves the concept.

Example:

- Host machine runs LoreKeeper.
- Guest on the same network visits `/guest`.
- Guest can join without downloading anything.

That is already the correct table shape. The problem is remote access.

A LAN IP works inside the house, but not for a Discord friend across the world. Residential NAT, routers, firewalls, dynamic IPs, and ISP behavior still make direct inbound hosting painful.

This is the same emotional problem people had with old multiplayer setup:

- port forwarding
- Hamachi
- router settings
- firewall exceptions
- "why can't you connect?"
- "are you still there?"

LoreKeeper should not make casual players relive that.

## The Wrong Product Answer

The wrong answer is:

"Tell guests to install a networking tool."

Tailscale, VPNs, tunnels, and similar tools may be useful for development or nerd playtests, but they are not the product answer for normal guests.

A technically good networking tool can still be a product failure if the guest has to care about it.

If a guest flow becomes:

1. Install LoreKeeper.
2. Install Ollama.
3. Install Tailscale.
4. Make an account.
5. Join my network.
6. Try this IP.
7. Debug firewall issues.

Then the guest flow is dead.

## The Right Product Shape

Guests should not hit the host machine directly through raw networking.

Guests should hit a public doorway.

The host app should maintain an outbound connection to that public doorway.

Then the public layer relays guest messages to the host and host updates back to guests.

Conceptual shape:

Host machine:

- LoreKeeper host
- local DB
- campaign state
- Ollama or provider key
- table authority

Public layer:

- invite URL
- session rendezvous
- message relay
- basic authorization
- no campaign canon ownership
- no DM brain
- no model runtime

Guest browser:

- join link
- table view
- character/player actions
- no install
- no model
- no networking tool

## Phase 0: LAN Guest Mode

Status: already working or mostly working.

Use case:

- Girlfriend/house guest/local player joins on the same Wi-Fi.
- Host sends a local network `/guest` link.
- Guest joins in browser.

This proves the core UX:

- host owns complexity
- guest joins instantly
- browser guest surface works

Keep this mode. It is useful for local testing and in-house play.

## Phase 1: Host-Side Tunnel for Nerd Demo

Goal:

Let the host suffer a little so a remote nerd friend can join through a normal browser link.

This is not the final product answer, but it is a strong demo/playtest bridge.

Possible approach:

- Host installs/configures a tunnel tool.
- LoreKeeper exposes only the guest/table surface through the tunnel.
- Host sends the generated public guest URL to a friend.
- Friend opens it in browser.
- Host approves join request.
- Friend joins table.

Important security rule:

Only expose guest-safe routes.

Do expose:

- `/guest`
- guest websocket/API routes
- invite/session endpoints needed for play

Do not expose:

- host admin screens
- provider settings
- Ollama
- local model endpoints
- filesystem access
- debug routes
- campaign management routes unless explicitly guest-safe
- raw database endpoints

Phase 1 success criteria:

- One host can share a remote invite link.
- One guest can join without installing anything.
- Host can approve or deny the guest.
- Guest can see table state.
- Guest can submit player actions.
- Host remains the authority.
- No local model/provider endpoint is exposed.

This phase is allowed to be a little nerdy for the host. It must stay effortless for the guest.

## Phase 2: Built-In Share Table Flow

Goal:

Make the remote table flow feel like a LoreKeeper feature, not a pile of developer tools.

Host UX:

1. Open campaign.
2. Start table session.
3. Click "Share Table."
4. LoreKeeper generates invite link.
5. Host sends link in Discord.
6. Guest joins.
7. Host sees pending guest.
8. Host approves.
9. Guest enters table.

Guest UX:

1. Click link.
2. See LoreKeeper guest page.
3. Enter display name or select assigned character.
4. Wait for approval if required.
5. Join table.

Required concepts:

- table session ID
- invite token
- guest identity
- guest permissions
- host approval
- guest connection status
- table event stream
- guest action submission
- host authoritative state updates

The host should always remain in control.

## Phase 3: LoreKeeper Relay

Goal:

Replace ad hoc tunnel setup with a small purpose-built relay service.

The relay is not LoreKeeper cloud hosting.

The relay should not own the campaign.

The relay should not run the DM.

The relay should not need the full campaign database.

The relay is a mail slot.

It connects guests to a host session.

Host app:

- opens outbound websocket connection to relay
- registers a table session
- receives guest join requests
- receives guest actions
- sends guest-safe table updates

Guest browser:

- opens public invite URL
- connects to relay
- sends join request
- receives table updates
- submits player actions

Relay:

- maps invite/session tokens to host connections
- forwards messages
- enforces basic session/invite rules
- handles disconnect/reconnect basics
- does not expose host local network
- does not store long-term campaign canon

This gives normal guests the experience they expect:

"Click link and join."

## Phase 3A: Friend Code Relay MVP

Goal:

Make remote play possible for a tiny alpha without requiring guest downloads or raw host networking.

Current repo state:

- Friend-code/session primitives exist in `src/multiplayer/friend-code-session.js`.
- The module separates the short human friend code from the unguessable internal token.
- It defines default alpha limits: short-lived code, idle timeout, max session duration, max guests, and max payload size.
- It validates guest-safe relay message kinds and rejects host-only fields such as provider settings, secrets/tokens, Ollama/local paths, raw provider payloads, diagnostics, and filesystem/debug-shaped data.
- Host snapshots expose only a public `remoteFriendCode` projection.
- Friends And Seats has a disabled Remote Friend Code panel so the product surface is visible without pretending the relay exists.
- A Cloudflare Worker/Durable Object relay skeleton exists under `workers/relay`, with tested message parsing and guest/host allowlists.
- The alpha relay is deployed at `https://lorekeeper-friend-relay.wirsingj.workers.dev`.
- Public smoke checks pass for `/`, friendly `/host/:hostSlug/table-code/:code` links, `/health`, and `/api/session/:code`.
- Host WebSocket connect smoke checks prove a live host flips `/api/session/:code` to `active: true`.
- The LoreKeeper host UI can create a remote friend-code session, copy the link/code, and open a host relay WebSocket.
- The public relay guest page can submit a browser `guest.join.request`; relay smoke checks prove the connected host receives that request with a relay guest id.
- The LoreKeeper host app handles `guest.join.request` by registering the friend into the existing waiting-room flow, so host approval/seating stays local and authoritative.
- When the host seats that waiting guest, the host app sends a targeted `host.guest.approved` message back through the relay; live relay smoke checks prove the browser guest receives it and moves past waiting.
- There is no live full guest table page after approval yet; approved guest table snapshots/actions still need relay-to-table bridge work.

Host-facing behavior:

- Friends And Seats shows Local LAN Link and Remote Friend Code as separate share methods.
- Host clicks Start Remote Sharing.
- LoreKeeper opens an outbound relay connection.
- Relay returns a short friend code and optional browser link.
- Host can Copy Code, Copy Link, Regenerate, and Stop Sharing.
- Host sees waiting guests and approves/denies/removes them.

Guest-facing behavior:

- Guest opens the public browser page.
- Guest enters friend code.
- Guest sees only guest-safe table preview and seat request UI.
- Guest can submit Table Talk and assigned-character actions after approval.
- Guest sees clear waiting/rejected/disconnected states.

Internal requirements:

1. `FriendCodeSession` maps human-friendly code to unguessable session token.
2. Host relay client keeps an outbound connection alive; no inbound LAN exposure is required.
3. Relay forwards only typed guest-safe messages, not arbitrary HTTP to the host server.
4. Existing local table session identity remains authoritative: campaign ID, table ID, session ID, guest ID, seat assignment, host approval.
5. Relay messages must carry identity and be rejected if stale.
6. Guest actions remain staged requests; the host/app commits or rejects.
7. Provider settings, provider keys, Ollama/local model endpoints, filesystem/debug routes, campaign management, raw database access, and host/admin controls remain impossible through the relay.
8. Rejected remote messages must prove no mutation: no provider generation, no play-log entry, no staged input, no controller transfer, no combat/recovery change.

External/human setup for alpha:

1. Pick a relay host. Default recommendation for tiny friend testing is a Cloudflare Worker/Durable Object style relay because the guest is browser-native and early traffic is tiny.
2. Use the current temporary Workers URL, or later pick a custom route such as `play.lorekeeper.app`.
3. Create the provider account/project and keep deploy credentials out of Git.
4. Decide whether the remote share button is hidden/dev-only, private-alpha, or visible with an "experimental" warning.
5. Decide initial quotas: max guests, max sessions, code lifetime, idle timeout, max session duration, and max payload size.
6. Accept that free-tier relay is an alpha constraint, not a permanent promise for public scale.

## Phase 4: Smarter Transport Options

Later, LoreKeeper can evaluate better transport layers.

Possible future paths:

### Relay-Only

Simplest product path.

All guest traffic goes through LoreKeeper Relay.

Pros:

- predictable
- browser-friendly
- simple mental model
- no NAT surprises for guests

Cons:

- relay bandwidth and hosting cost
- relay uptime matters
- central service required for remote play

### WebRTC Data Channels

Browser-native peer-style transport.

Pros:

- good fit for browser guests
- can reduce relay traffic when direct connections work
- encrypted data channels

Cons:

- still needs signaling
- still needs ICE/STUN/TURN
- direct connection can fail
- TURN relay may still be needed
- more complexity

### Steam Networking

If LoreKeeper ships on Steam, Steam networking may become interesting.

Pros:

- Steam can absorb distribution and update friction
- Steam networking can help with P2P/relay scenarios
- users trust Steam install/update flows more than random ZIPs

Cons:

- Steam-specific surface
- paperwork/review/release process
- not useful for non-Steam guests unless designed carefully
- should not block current playtesting

## Security Doctrine

Remote guest access must be treated as hostile by default.

Guest traffic is not trusted just because the guest is a friend.

Rules:

1. Guest routes are separate from host/admin routes.
2. Host-only controls must not be reachable from guest mode.
3. Invite tokens must be unguessable.
4. Host should be able to approve guests.
5. Host should be able to remove guests.
6. Guest permissions should be explicit.
7. Guest actions should be requests, not direct state mutations.
8. Host remains authoritative.
9. Provider credentials never leave the host.
10. Ollama/local model endpoints must never be exposed directly.
11. File paths and local filesystem access must never be exposed to guests.
12. Debug/dev endpoints must not be reachable through remote sharing.
13. Logs should avoid leaking provider keys or sensitive local paths.
14. Guest-visible state should be intentionally shaped, not raw DB dumps.

## Architecture Doctrine

LoreKeeper should stay one app.

Do not revive Thinclient as a separate product.

Use these terms:

- Host app
- Guest mode
- Table session
- Invite link
- Relay
- Provider
- Local model
- Campaign canon

Avoid these as product-facing concepts:

- Thinclient
- NAT traversal setup
- port forwarding
- VPN required
- install this networking thing
- connect to my IP

Internals can be complex. The product explanation should be simple.

## Development Roadmap

Recommended order:

Current priority note:

Remote Friend Code MVP is now the next product step. LAN guest mode already proves the browser guest surface; more solo polish cannot prove the real table experience. Use the existing LAN/session authority as the base, but aim the next implementation pass at off-LAN browser guests joining by friend code through a guest-safe relay.

### Step 1: Document the existing LAN guest flow

Capture:

- how host starts the table
- what `/guest` does
- what guest can see
- what guest can submit
- what routes are guest-safe
- what routes must never be guest-exposed

### Step 2: Add route/security audit

Identify:

- host-only routes
- guest routes
- shared APIs
- websocket endpoints
- provider/model endpoints
- filesystem/debug endpoints

Create an allowlist for guest exposure.

### Step 3: Add invite/session model

Add:

- table session ID
- invite token
- friend code mapped to an unguessable internal token
- guest identity
- guest status
- guest permissions
- host approval state

Do this in a way that supports both LAN links and remote friend-code sessions. Friend codes are product-facing; tokens/session ids are internal.

### Step 4: Add "Share Table" / Friends And Seats UI

The current LAN link is useful, but the next share surface should establish both local and remote concepts:

- Local LAN Link
- Remote Friend Code
- Copy Code
- Copy Link
- Regenerate
- Stop Sharing
- See waiting/connected guests
- Approve/remove guests
- Show expiry/idle/experimental status

### Step 5: Relay MVP, not guest-installed tunnel tools

Prototype a minimal relay path for friend-code guests:

- host outbound connection,
- public guest page,
- friend-code lookup,
- typed guest-safe messages,
- host approval,
- snapshot/action/Table Talk/pass/vote/disconnect/rejoin forwarding,
- no arbitrary proxying to host routes.

Do not make guest-installed tunnel tools part of the product. Host-side tunnel experiments may remain useful for development, but the product path is browser guest plus relay.

### Step 6: Relay hardening

Before wider testing, add:

- code expiry,
- idle timeout,
- max session duration,
- max guests,
- payload limits,
- rate limits,
- revoke/stop sharing,
- stale identity rejection,
- no-mutation tests for rejected relay messages.

### Step 7: Productize remote guest flow

Make the final guest experience:

- Discord link
- browser join
- host approval
- table play

## Success Criteria

LoreKeeper remote table access succeeds when:

- A host can run the DM brain locally.
- A guest can join from a Discord link without installing anything.
- Provider keys and local model endpoints remain private.
- Campaign canon stays on the host unless deliberately exported/synced.
- Host controls table state.
- Guest actions are safe and permissioned.
- Remote play does not require guests to understand networking.
- The flow feels like a tabletop invite, not a networking setup.

## Product Mantra

The host is the nerd.

The guest is the player.

The host can configure models, providers, tunnels, relays, files, campaigns, and table settings.

The guest should click the tavern invite and sit down.
