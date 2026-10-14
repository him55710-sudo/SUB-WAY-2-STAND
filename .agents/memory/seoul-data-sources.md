---
name: Seoul subway data sources and access quirks
description: What works from this environment when fetching Seoul subway live data or station coordinates, and provider behaviors the code relies on.
---

- The Seoul realtimePosition provider is HTTP-only: port 443 on swopenapi.seoul.go.kr times out (checked 2026-10-14).
  The key therefore travels in plaintext server→provider. The proxy only accepts other bases if they are https relays.
  **Why:** there is no TLS endpoint; an earlier replit.md gotcha asked to "move to TLS", which is not possible.
  **How to apply:** don't spend time retrying https; if TLS is required, it has to be a relay.
- The literal key `sample` works over HTTP for up to 5 rows — handy for probing without the real secret.
- Secrets added mid-session do not appear in the agent shell env; restart the API workflow and test through the proxy.
- Station coordinates: Nominatim (`q="<역명> station"`, Seoul viewbox, bounded=1, custom User-Agent, ≤1 req/s) works;
  Overpass API returned 504/406 from here.
- updnLine on Line 2: "0" = 내선 = clockwise = statnId increasing; "1" = 외선. Verified by polling train movement.
