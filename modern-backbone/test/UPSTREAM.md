# Backbone test provenance

The behavioral catalog was reviewed from
[`jashkenas/backbone`](https://github.com/jashkenas/backbone) at commit
`f229c75b194a63a8e07a3313ce43e8d2dc105327`.

That upstream suite contains 440 QUnit cases across Model (112), Collection
(144), View (34), Router and History (77), Sync (18), and Backbone's custom
Events mixin (55). It targets the full Backbone API, including Underscore
methods, validation, parsing, comparators, callback-style sync, hash routing,
delegated jQuery events, and other features this project deliberately excludes.

The local tests are TypeScript tests authored for Node's test runner. They adapt
the upstream contracts that still belong to the smaller public surface:

| Local suite | Upstream behavior retained |
| --- | --- |
| `model.test.ts` | keyed reads, object attributes, falsey IDs, no-op sets, fully committed batch changes, encoded resource URLs, create/update/read/delete persistence, request options, and failure behavior |
| `collection.test.ts` | raw-record conversion, exact ID lookup, duplicate identity, ordered insertion/removal, ID reindexing, removal cleanup, destroy-driven removal, and add/remove/update ordering |
| `view.test.ts` | default and supplied elements, chainable rendering, DOM and domain-event listening, listener options, removal, and complete subscription cleanup |
| `router.test.ts` | simple and named routes, registration precedence, parameter decoding, malformed escapes, query/hash exclusion, push/replace state, initial resolution, restart, popstate, and unmatched paths |

The other upstream cases are not copied as skipped tests. A permanent wall of
skips would imply a compatibility roadmap and make the intentionally absent API
look unfinished. Adding one of those behaviors requires first showing why it
cannot live in application code.
