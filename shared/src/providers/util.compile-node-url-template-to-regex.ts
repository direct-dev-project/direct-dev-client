const escapeRegExp = /[.*+?^$()|[\]\\]/g;
const placeholderRegExp = /\{(.*?)\}/g;

/**
 * utility to compile provider node URL templates into regular expressions,
 * which are used to match incoming provider URLs against provider
 * configurations
 */
export function compileNodeUrlTemplateToRegEx(template: string): RegExp {
  const pattern = template
    // escape special RegExp characters to avoid creating invalid outputs
    .replace(escapeRegExp, "\\$&")

    // transform {placeholders} into RegExp patterns matching all
    .replace(placeholderRegExp, "([A-Za-z0-9-_.!~*'()%]+)");

  return new RegExp(`^${pattern}$`);
}
