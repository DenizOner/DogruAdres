/** Native Mercur Seller scheduled-closure gate used by private discovery AND
 * the final pre-Order write authorization. No Buyer/Owner rights are inferred
 * from native Seller state; those remain independent Foundation checks.
 *
 * The scheduled closed interval is [closed_from, closed_to). When only one
 * bound exists, the interval extends indefinitely in the missing direction.
 * Malformed or reversed timestamps fail closed instead of granting sales.
 */
export function nativeSellerTradingAt(s:{
  status:unknown;
  approved_at?:unknown;
  closed_from?:Date|string|null;
  closed_to?:Date|string|null;
},now=Date.now()):boolean{
  if(s.status!=="open"||!Number.isFinite(now))return false
  // Native approval is a timestamp, not a truthy marker. Corrupt or missing
  // approval metadata must never unlock private discovery or checkout.
  const approvedAt=s.approved_at instanceof Date?s.approved_at.getTime():
    typeof s.approved_at==="string"?new Date(s.approved_at).getTime():NaN
  if(!Number.isFinite(approvedAt))return false
  const from=s.closed_from==null?null:new Date(s.closed_from).getTime()
  const to=s.closed_to==null?null:new Date(s.closed_to).getTime()
  if(from===null&&to===null)return true
  if((from!==null&&!Number.isFinite(from))||
     (to!==null&&!Number.isFinite(to))||
     (from!==null&&to!==null&&from>=to))return false
  return !(now>=(from??Number.NEGATIVE_INFINITY)&&
    now<(to??Number.POSITIVE_INFINITY))
}
