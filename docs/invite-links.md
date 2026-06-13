# Invite Links

Invite links are plain text in v1. The app can parse a pasted link; OS protocol-handler registration is not required.

## Shape

```text
lorekeeper://join?host=192.168.1.24&port=7347&campaign=campaign-id&seat=party-member-id&token=invite-token
```

Fields:

- `host`: LAN host address.
- `port`: host app port.
- `campaign`: campaign id the invite belongs to.
- `seat`: party member id being offered for control.
- `token`: random invite secret.

## Security Model

- Invite links include a token.
- The host validates campaign id, seat id, and token.
- Invites can be revoked.
- Approval is required before a guest becomes connected.
- Guests can only submit actions for their assigned party member.
- Guests cannot accept canon updates or call the model directly.

## Future Path

The same shape can support direct internet connections later by replacing `host` with a reachable IP/domain or tunnel endpoint. Relay support should preserve campaign, seat, and token semantics.
