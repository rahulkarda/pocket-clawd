/**
 * Strip the <SPEC_READY>...</SPEC_READY> block from displayed text.
 *
 * Three cases:
 *  - complete block: remove it
 *  - opening tag without closing (mid-stream): remove from <SPEC_READY> to end
 *  - partial opening tag (e.g. "<SPEC_RE" while streaming): also remove,
 *    so the user doesn't see the tag glitching in.
 */
const PARTIAL_OPEN = /<(?:S(?:P(?:E(?:C(?:_(?:R(?:E(?:A(?:D(?:Y>?)?)?)?)?)?)?)?)?)?)?$/

export function stripSpec(text: string): string {
  return text
    .replace(/<SPEC_READY>[\s\S]*?(<\/SPEC_READY>|$)/g, '')
    .replace(PARTIAL_OPEN, '')
    .trim()
}

