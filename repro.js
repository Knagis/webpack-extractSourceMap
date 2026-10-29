import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import webpack from "webpack";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const extractSourceMapRule = { test: /\.js$/, extractSourceMap: true };
const sourceMapLoaderRule = { test: /\.js$/, enforce: "pre", use: [require.resolve("source-map-loader")] };

const cases = [
    { id: "extract-devtool", label: "rule.extractSourceMap", devtool: "source-map", rule: extractSourceMapRule },
    { id: "extract-no-devtool", label: "rule.extractSourceMap", devtool: false, rule: extractSourceMapRule },
    { id: "loader-devtool", label: "source-map-loader", devtool: "source-map", rule: sourceMapLoaderRule },
    { id: "loader-no-devtool", label: "source-map-loader", devtool: false, rule: sourceMapLoaderRule },
];

function build({ id, devtool, rule }) {
    const compiler = webpack({
        mode: "none",
        context: root,
        entry: "./src/index.js",
        devtool,
        output: { path: path.join(root, "dist", id), filename: "main.js", clean: true },
        module: { rules: [rule] },
    });
    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            compiler.close(() => (err ? reject(err) : resolve(stats)));
        });
    });
}

const results = [];
for (const testCase of cases) {
    const stats = await build(testCase);
    const { errors, warnings } = stats.toJson({ all: false, errors: true, warnings: true });
    for (const problem of [...errors, ...warnings]) {
        console.log(`[${testCase.id}] ${problem.message}`);
    }

    const outDir = path.join(root, "dist", testCase.id);
    const bundle = fs.readFileSync(path.join(outDir, "main.js"), "utf8");
    const staleComments = bundle
        .split("\n")
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(({ text }) => text.includes("sourceMappingURL=lib.js.map"));

    const mapFile = path.join(outDir, "main.js.map");
    const bundleMap = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, "utf8")) : undefined;

    results.push({
        setup: testCase.label,
        devtool: String(testCase.devtool),
        "lib.ts in main.js.map": bundleMap ? bundleMap.sources.some((source) => source.endsWith("lib.ts")) : "(no map)",
        "lib.js.map comment in main.js": staleComments.length
            ? staleComments.map(({ line }) => `YES (line ${line})`).join(", ")
            : "no",
    });
}

console.log(`webpack ${webpack.version}, source-map-loader ${require("source-map-loader/package.json").version}`);
console.table(results);

const buggy = results.filter((result) => result["lib.js.map comment in main.js"] !== "no");
if (buggy.length) {
    console.log("\nThe stale `//# sourceMappingURL=lib.js.map` comment leaked into the bundle in:");
    for (const result of buggy) {
        console.log(`  - ${result.setup} with devtool: ${result.devtool}`);
    }
    process.exitCode = 1;
}
