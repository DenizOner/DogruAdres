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
  const approval=s.approved_at
  let approvedAt=NaN
  if(approval instanceof Date)approvedAt=approval.getTime()
  else if(typeof approval==="string"&&
      /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/.test(approval)){
    // Date.parse can normalize impossible dates (e.g. February 30).
    const day=approval.slice(0,10),calendar=new Date(day+"T00:00:00Z")
    if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==day)
      return false
    approvedAt=Date.parse(approval)
  }
  // Approval must have happened already; future-dated approvals are not
  // authoritative even when their native ISO/Date representation is valid.
  if(!Number.isFinite(approvedAt)||approvedAt>now)return false
  const from=s.closed_from==null?null:new Date(s.closed_from).getTime()
  const to=s.closed_to==null?null:new Date(s.closed_to).getTime()
  if(from===null&&to===null)return true
  if((from!==null&&!Number.isFinite(from))||
     (to!==null&&!Number.isFinite(to))||
     (from!==null&&to!==null&&from>=to))return false
  return !(now>=(from??Number.NEGATIVE_INFINITY)&&
    now<(to??Number.POSITIVE_INFINITY))
}
