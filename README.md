# Modern Backbone workspace

Small browser-native libraries in a workspace designed to keep application and
documentation concerns out of the published packages.

| Path | Responsibility |
| --- | --- |
| `modern-backbone/` | Publishable `@charliewilco/modern-backbone` TypeScript library, happy-dom unit tests, and tsdown build |
| `modern-handlebars/` | Optional `@charliewilco/modern-handlebars` context-aware tagged-template library |
| `examples/todos/` | Parcel browser bundle, REST preview server, and Playwright contract |
| `examples/hacker-news/` | Hacker News API reader with feed, detail, and History routes |
| `examples/tic-tac-toe/` | Local game-state example with route-selected starting players |
| `examples/weather/` | Open-Meteo geocoding and current-weather explorer |
| `docs/` | Architecture and project documentation |

## Development

```sh
npm install
npm test
npm run check
```

Turbo coordinates workspace builds, tests, and type-checking. Each code
workspace owns one `tsconfig.json`; compiler configuration follows package
boundaries rather than individual build artifacts.

`npm test` runs both library unit suites and all four headless Playwright suites.
Each example owns a distinct local port, so Turbo can run them concurrently.

Run any example from the repository root:

```sh
npm run example:todos
npm run example:hacker-news
npm run example:tic-tac-toe
npm run example:weather
```

The examples use ports 4173 through 4176 respectively. `npm run example`
remains an alias for the Todo app.

## License

[The Unlicense](./LICENSE).
