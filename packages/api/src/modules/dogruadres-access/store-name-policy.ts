/** Shared objective Store display-name constraints. Human brand/impersonation
 * review and globally reserved normalized names remain server-side decisions.
 * Kept identical to the previously accepted B22 submission validator.
 */
export const validStoreName=(name:string)=>{
  const normalized=name.normalize("NFKC")
  // The running Node.js supports Segmenter, but Medusa's TS lib does not
  // expose its typings. Narrow the runtime capability without adding a dep.
  const segmenter=(Intl as unknown as {Segmenter:new (
    locale:string,options:{granularity:"grapheme"}
  )=>{segment:(value:string)=>Iterable<unknown>}}).Segmenter
  const parts=Array.from(new segmenter("und",{
    granularity:"grapheme"
  }).segment(name)) as Array<{segment:string}>
  // A zero-width space, soft hyphen or format control is not a visible
  // character and can conceal a collision with another Store name.
  // Preserve real emoji graphemes containing ZWJ/variation selectors.
  const disguised=parts.some(({segment})=>
    /\p{Default_Ignorable_Code_Point}/u.test(segment)&&
    !/^\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*$/u.test(segment))
  const graphemes=parts.length
  const compact=normalized.replace(/\s/gu,"")
  // An all-digit Store name is still invalid if spaced (including NFKC spaces).
  // Match domain-looking words at word boundaries, not innocent substrings.
  return name.length<=120&&!disguised&&graphemes>=3&&graphemes<=40&&
    !/[\x00-\x1f\x7f]/.test(name)&&!/^\p{Number}+$/u.test(compact)&&
    !/(?:^|\s)(?:https?:\/\/|www\.)/iu.test(normalized)&&
    !/(?:^|\s)[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[\p{L}]{2,24}(?:$|\s|\/)/iu.test(normalized)&&
    !/\.(?:com(?:\.tr)?|net|org(?:\.tr)?)(?:$|\s)/iu.test(normalized)&&
    !/(?:^|\s)(?:ltd\.?\s*şti\.?|şti\.?|a\.?\s*ş\.?|limited\s+şirketi|anonim\s+şirketi)$/iu.test(normalized)
}

/** Revision v2: on 2026-11-05 Owner approved disclosure with NO day-count promise.
 * Keep the exact public disclosure in personal/route.ts and assert it in real Chrome.
 * Internal 30-day reservation is a separate server-side lifecycle policy.
 */
export const STORE_RENAME_RISK_VERSION="store-rename-risks-v2" as const
/** URL keys are public, stable, ASCII-only; no slashes, confusables or escapes. */
export const validStoreHandle=(handle:string)=>
  handle.length>=3 && handle.length<=60 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)
