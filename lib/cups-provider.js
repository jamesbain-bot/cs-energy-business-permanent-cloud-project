'use strict';
/* Server-side integration boundary only. No route, credentials or live provider is enabled.
 * Deployment must enforce existing owner auth, consent, audit, per-tenant cache and provider terms.
 * An adapter may only return supplies authorised by the provider, never checkbox-only consent.
 */
const STATES=Object.freeze(['not-connected','authorization-pending','connected','revoked','no-data','error']);
async function lookup({cups,authorizationStatus,adapter}){
 if(!adapter)return{state:'not-connected',data:null};
 if(authorizationStatus==='revoked')return{state:'revoked',data:null};
 if(authorizationStatus!=='provider-authorized')return{state:'authorization-pending',data:null};
 if(typeof cups!=='string'||!cups.trim())return{state:'error',code:'missing-cups',data:null};
 const selected=cups.trim().toUpperCase();
 try{
  const supplies=await adapter.listAuthorizedSupplies();
  const supply=supplies.find(s=>s.cups===selected);
  if(!supply)return{state:'authorization-pending',data:null};
  const result=await adapter.readSupply(supply);
  if(!result||!Array.isArray(result.intervals)||!result.intervals.length)return{state:'no-data',data:null};
  if(!result.source||!result.period||!result.timezone||result.unit!=='kWh'||!['grid-import','grid-export'].includes(result.measurement))return{state:'error',code:'incomplete-provenance',data:null};
  return{state:'connected',data:result};
 }catch{return{state:'error',code:'provider-unavailable',data:null}} // No secret-bearing upstream errors or blind retry.
}
module.exports={STATES,lookup};
