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

## Product Target

The long-term product sentence is:

"I host the table locally. My friends join from Discord with a browser link. My machine runs the DM brain."

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
- guest identity
- guest status
- guest permissions
- host approval state

Do this locally first, even before remote relay exists.

### Step 4: Add "Share Table" UI

First version may only show LAN link and future remote placeholder.

It should establish the product concept:

- Start session
- Copy invite link
- See connected guests
- Approve/remove guests

### Step 5: Host-side tunnel experiment

Create a documented dev/playtest path for exposing only guest-safe routes.

Do not make this mandatory for all users.

Do not expose host/admin routes.

### Step 6: Relay spike

Prototype a minimal relay:

- host outbound websocket
- guest websocket
- session mapping
- message forwarding
- basic auth/invite token
- host approval

Keep the relay small.

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
