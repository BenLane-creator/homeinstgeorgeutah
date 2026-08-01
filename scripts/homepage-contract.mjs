export const canonicalHeadline = "Better Real Estate Decisions.";

const namedEntities = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&#(\d+);/g, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities.get(name.toLowerCase()) ?? match);
}

export function htmlToVisibleText(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[^]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function homepageHasCanonicalHeadline(html) {
  return htmlToVisibleText(html).includes(canonicalHeadline);
}
