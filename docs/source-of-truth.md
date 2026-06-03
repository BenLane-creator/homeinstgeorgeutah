# Project source of truth

## Internal architecture authority

`docs/revised-master-architecture-spec.md` is the controlling project architecture for HomeInStGeorgeUtah.com.

It supersedes earlier assumptions that treated the product as:

- Washington County only
- WordPress/GoDaddy production architecture
- Flexmls plugin pages as the runtime search layer
- vendor-owned account, saved-search, saved-home, alert, lead-routing, or booking logic
- CRM-owned lead logic
- booking-owned routing logic

## External MLS/API authority

Spark Platform documentation is the canonical external MLS/API reference:

https://sparkplatform.com/docs

Spark/Flexmls/FBS remains the approved MLS data and authenticated-access boundary where required. It must not become the product core.

## Implementation rule

All high-intent actions must hit the first-party API before any downstream vendor sink:

1. validate payload
2. normalize input
3. identify or merge contact
4. attach attribution session
5. attach property or geo context
6. classify intent
7. assign workflow lane
8. create AI enrichment/handoff where needed
9. create booking handoff if appropriate
10. persist full lead event history
11. sync downstream to HubSpot
12. update reporting and conversion data
