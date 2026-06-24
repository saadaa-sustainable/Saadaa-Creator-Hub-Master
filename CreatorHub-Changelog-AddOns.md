
### Faster Reach Out fetch — media.limit 12→6 (2026-06-24)
- Reduced Meta `business_discovery` `media.limit(12)` → `media.limit(6)` in `lib/meta-graph.ts`. The media pull dominates the per-fetch latency, so ~halves the single-fetch time (the user-reported 4-5s). ER/avg_likes now computed over the 6 most-recent posts — still representative. Applies to both single + batch fetches.
