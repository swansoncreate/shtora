export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@tanstack/react-router") {
    return nextResolve(new URL("./router-stub.mjs", import.meta.url).href, context);
  }
  if (specifier.startsWith("@/")) {
    const path = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url);
    return nextResolve(path.href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.(ts|js|mjs|cjs|json)$/i.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
