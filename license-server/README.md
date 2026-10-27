# Licence server

Issues, verifies and revokes activation codes for DROP deployments.

```bash
LICENCE_ADMIN_SECRET=change-me node license-server/server.mjs
```

| Variable | Purpose |
| --- | --- |
| `PORT` | Default `4660` |
| `LICENCE_DB` | JSON file path, default `licences.json` |
| `LICENCE_ADMIN_SECRET` | Required to issue/revoke. Unset disables issuing. |

## Issue a key

```bash
curl -X POST localhost:4660/v1/issue \
  -H 'Content-Type: application/json' \
  -d '{"adminSecret":"change-me","domain":"shop.example.com","plan":"standard","expiresAt":"2027-12-31"}'
```

Returns the key **once** — only its SHA-256 is stored, so a lost key can't be recovered; issue a new one.

## Client config

In the store's `.env`:

```
LICENSE_SERVER_URL="https://licence.yourdomain.com"
LICENSE_KEY="DROP-..."          # optional; can also be entered at /license
```

## Behaviour

- A key is bound to the domain it was issued for, and to the first host fingerprint that uses it (single-seat).
- `GET /v1/list?adminSecret=…` shows every key without exposing the key material, plus the last 50 activations.
- Revoking takes effect within the store's 15-minute licence cookie, or immediately on the next `/api/license/status` call.
- If the server is unreachable, the store keeps working for `LICENSE_GRACE_MS` (default 72h) and then locks.
