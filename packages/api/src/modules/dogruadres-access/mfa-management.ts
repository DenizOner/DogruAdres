/** Only server clock / persisted session fields; never browser timestamps. */
export function hasRecentMfaProof(session:{last_strong_auth_at?:unknown;now_ms?:unknown;mfa_purpose?:unknown}, seconds:unknown) {
  const strong=session.last_strong_auth_at instanceof Date?session.last_strong_auth_at.getTime():
    typeof session.last_strong_auth_at==="string"?Date.parse(session.last_strong_auth_at):NaN
  return session.mfa_purpose==="full"&&typeof session.now_ms==="number"&&Number.isFinite(session.now_ms)&&
    Number.isSafeInteger(seconds)&&(seconds as number)>=60&&(seconds as number)<=600&&
    Number.isFinite(strong)&&strong<=session.now_ms&&session.now_ms<strong+(seconds as number)*1000
}