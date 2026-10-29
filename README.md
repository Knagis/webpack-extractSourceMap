# `rule.extractSourceMap` leaves `//# sourceMappingURL` comments in the bundle when `devtool` is disabled

With `module.rules[].extractSourceMap: true`, webpack strips the `//# sourceMappingURL=...` comment from a module and uses the referenced map, but only when source maps are enabled (`devtool` set). With `devtool: false` the module is passed through untouched and the comment ends up in the bundle.

`source-map-loader`, which `extractSourceMap` replaces, removes the comment regardless of `devtool`.

## Steps

```sh
npm install
npm run repro
```

`repro.js` bundles `src/index.js`, which imports `src/vendor/lib.js`. That file is pre-compiled and ends with `//# sourceMappingURL=lib.js.map` (the map points to `lib.ts`). It builds four times, using `extractSourceMap` or `source-map-loader` with `devtool: "source-map"` or `devtool: false`. For each build it checks whether the comment survived in `dist/<case>/main.js`. It exits with code 1 if any build kept the comment.

## Actual

```
webpack 5.108.4, source-map-loader 5.0.0
┌─────────┬─────────────────────────┬──────────────┬───────────────────────┬───────────────────────────────┐
│ (index) │ setup                   │ devtool      │ lib.ts in main.js.map │ lib.js.map comment in main.js │
├─────────┼─────────────────────────┼──────────────┼───────────────────────┼───────────────────────────────┤
│ 0       │ 'rule.extractSourceMap' │ 'source-map' │ true                  │ 'no'                          │
│ 1       │ 'rule.extractSourceMap' │ 'false'      │ '(no map)'            │ 'YES (line 15)'               │
│ 2       │ 'source-map-loader'     │ 'source-map' │ true                  │ 'no'                          │
│ 3       │ 'source-map-loader'     │ 'false'      │ '(no map)'            │ 'no'                          │
└─────────┴─────────────────────────┴──────────────┴───────────────────────┴───────────────────────────────┘
```

`dist/extract-no-devtool/main.js`:

```js
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   greet: () => (/* binding */ greet)
/* harmony export */ });
function greet(name) {
  return "Hello, " + name;
}
//# sourceMappingURL=lib.js.map
```

## Expected

The comment is removed whenever `extractSourceMap` applies, like it is with `devtool` enabled and with `source-map-loader` in both modes.

The leftover comment belongs to the original file. In the bundle it is wrong. With `devtool: false` the bundle has no `sourceMappingURL` of its own, so this comment is the only one in the file. Browser devtools resolve it relative to the bundle (`dist/<case>/lib.js.map`), so they get either a 404 or an unrelated map that happens to sit at that path. Minification hides the problem in default production builds, because Terser drops the comment. It still shows with `devtool: false` in development mode, with `minimize: false`, and in library builds.

## Cause

In `lib/NormalModule.js`, extraction (which also strips the comment) is gated on source maps being enabled:

```js
if (
    this.extractSourceMap &&
    (this.useSourceMap || this.useSimpleSourceMap)
) {
    // extractSourceMap() strips the comment and reads the map
}
return callback(null, result); // otherwise returned as-is, comment included
```

Possible fix: when `extractSourceMap` is set but source maps are disabled, strip the comment (the `replacementString` from `getSourceMappingURL`) without reading the map file.
