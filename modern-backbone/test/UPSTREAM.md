# Backbone test provenance

The `upstream/vendor` directory contains the eight JavaScript QUnit suites from
[`jashkenas/backbone`](https://github.com/jashkenas/backbone) 1.6.1 at commit
[`da75718e896e52e84aa1f0411ba67fafcdcf6af3`](https://github.com/jashkenas/backbone/commit/da75718e896e52e84aa1f0411ba67fafcdcf6af3).
The files are vendored verbatim and remain covered by Backbone's MIT license in
`UPSTREAM-LICENSE`.

The corpus contains 442 QUnit cases:

| Suite | Cases |
| --- | ---: |
| `noconflict.js` | 1 |
| `debuginfo.js` | 1 |
| `events.js` | 55 |
| `model.js` | 112 |
| `collection.js` | 144 |
| `router.js` | 77 |
| `view.js` | 34 |
| `sync.js` | 18 |

`upstream/inheritance.test.ts` translates the separate upstream CoffeeScript
inheritance smoke test into one TypeScript `node:test` case. Together, the
oracle is 443 tests.

`npm run test:upstream` first verifies every vendored file's SHA-256 digest and
registered case count without network access. A small adapter then runs the
unchanged QUnit bodies through Node's test runner, with `tsx` and Happy DOM.
Pinned development dependencies provide Backbone 1.6.1, jQuery, and Underscore.

This oracle tests the pinned Backbone release itself. It preserves the upstream
behavioral record; it is not a claim that Modern Backbone is drop-in compatible.
Modern Backbone's intentionally smaller contracts remain in the adjacent
TypeScript test files and run separately through `npm run test:modern`.
