/** Only explicit brand names in observed merchant text; no merchant/category inference.
 * All marks are reviewed, bundled assets. No remote image requests or tracking. */
export function merchantMark(merchant:string):{src:string}|null{
 const name=merchant.normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()
 const brands:[RegExp,string][]=[[/^adobe(?: creative cloud| systems| inc)?(?: [0-9]+)?$/,'adobe'],[/^google (?:workspace|gsuite|g suite)(?: |$)/,'google'],[/^verizon(?: wireless)?(?: [0-9]+)?$/,'verizon'],[/^mcdonalds(?: restaurant)?(?: [0-9]+)?$/,'mcdonalds']]
 const brand=brands.find(([pattern])=>pattern.test(name))
 return brand?{src:`/merchants/${brand[1]}.svg`}:null
}
