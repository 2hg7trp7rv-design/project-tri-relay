# TRI RELAY playtest records

`/playtest` creates one local v0.4.1 session record for T01–T10. The report is
held in the current tab's Session Storage and is never submitted by the game.
Save the JSON immediately after each tester.

Real reports can include interview wording and operational details. Keep them
under `playtests/private/`, which is ignored by Git, or in another
access-controlled location with an agreed retention/deletion date. Never commit
real answer text, tester identity, raw User-Agent strings, or observer names.

After all ten exact-release reports are present, run:

```bash
npm run playtest:summary -- playtests/private/T01.json playtests/private/T02.json playtests/private/T03.json playtests/private/T04.json playtests/private/T05.json playtests/private/T06.json playtests/private/T07.json playtests/private/T08.json playtests/private/T09.json playtests/private/T10.json
```

The command rejects mixed commits/deployments, duplicate or missing T-IDs,
duplicate session IDs, pilot data, protocol deviations, incomplete mandatory
fields, contradictory observer/automatic timings, non-mobile first runs, and
more than the planned first ten sessions. It prints the decision, counts,
thresholds, missing/integrity diagnostics, shared source revision and deployment,
and a normalized SHA-256 of the inputs; it never prints interview answers.
Exit status is `0` for GO, `1` for
INCOMPLETE, and `2` for NO-GO.

The JSON Schema documents the exchange shape. The version-matched parser and
summarizer additionally enforce timestamp order, timing pairs, first-run
eligibility, and cross-field evidence consistency.

Synthetic fixtures may test the aggregator but are not operational evidence.
The JSON is local and unsigned, so the software cannot prove that a file was
not synthesized, edited, or selected after the fact. A trusted observer must
pre-register the T01–T10 roster/order, exact commit, immutable deployment, and
retention window in a separate access-controlled record. No real T01–T10 data
is committed in this repository.
