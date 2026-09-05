// CS Energy supplier invoice product matching helper
(function(){
 const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const sku=l=>l.sku||l.reference||l.supplier_sku||l.product_code||'';
 const desc=l=>l.description||l.model||l.name||'Invoice item';
 const cost=l=>Number(l.unitPriceNet||l.unit_price_net||l.unit_price||((l.lineTotalNet||l.line_total_net||0)/(Number(l.quantity||1)||1))||0);
 const nonProduct=s=>/shipping|delivery|transport|freight|carriage|discount|descuento|porte|portes|envio|recargo|fee|administration|iva|vat|tax/.test(String(s).toLowerCase());
 function match(l,supplier){
   let x=norm(sku(l));
   if(x){let p=data.products.find(p=>norm(p.sku)===x&&(!supplier||norm(p.supplier)===norm(supplier)));if(p)return [p,'SKU'];}
   x=norm(l.model);
   if(x){let p=data.products.find(p=>norm(p.model)===x&&(!l.manufacturer&&!l.brand||norm(p.manufacturer)===norm(l.manufacturer||l.brand)));if(p)return [p,'Manufacturer/model'];}
   let d=norm(desc(l));let p=data.products.find(p=>{let n=norm((p.manufacturer||'')+(p.model||''));return n.length>5&&(d.includes(n)||n.includes(d))});return p?[p,'Description']:null;
 }
 window.csSupplierProductReview=inv=>(inv.lines||inv.line_items||[]).map((l,i)=>{let supplier=inv.supplier||inv.supplier_name||inv.vendor_name||'Manual',m=match(l,supplier);return {i,l,supplier,match:m?.[0]||null,matchType:m?.[1]||'',cost:cost(l),action:m?'update':(!nonProduct(desc(l))&&cost(l)>0?'add':'ignore')}});
 window.csApplySupplierProducts=(inv,choices={})=>{let added=0,updated=0,now=new Date().toISOString(),no=inv.invoiceNumber||inv.invoice_number||'',date=inv.invoiceDate||inv.invoice_date||now.slice(0,10);
   for(const r of csSupplierProductReview(inv)){let a=choices[r.i]||r.action;if(a==='ignore')continue;
    if(a==='update'&&r.match){r.match.costHistory=Array.isArray(r.match.costHistory)?r.match.costHistory:[];r.match.costHistory.push({oldCost:Number(r.match.cost||0),newCost:r.cost,supplier:r.supplier,invoiceNo:no,date});r.match.cost=r.cost;r.match.updatedAt=now;updated++;continue;}
    if(a==='add'){let l=r.l,d=desc(l),parts=d.split(/\s+/);data.products.push({id:uid('p_'),supplier:r.supplier,category:'Other',manufacturer:l.manufacturer||l.brand||parts.shift()||'',model:l.model||parts.join(' ')||d,sku:sku(l),cost:r.cost,sell:0,markup:0,pricingMethod:'fixed',notes:'Added from supplier invoice '+no,updatedAt:now,costHistory:[{newCost:r.cost,supplier:r.supplier,invoiceNo:no,date}]});added++;}
   } save();if(typeof renderProducts==='function')renderProducts();return {added,updated};};
 window.csShowSupplierProductReview=(inv,onDone)=>{let rows=csSupplierProductReview(inv),box=document.createElement('div');box.className='modal open';box.style.zIndex='1400';box.innerHTML='<div class="modalbox wide"><div class="modaltop"><h2>Check invoice products</h2><button class="close" data-x>×</button></div><p class="muted">Existing products are matched by SKU first. Missing products can be added automatically. Delivery, discounts and fees are ignored by default.</p><div style="overflow:auto"><table style="width:100%"><thead><tr><th>Item</th><th>Cost ex IVA</th><th>Match</th><th>Action</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(desc(r.l))+'</strong><br><small>'+esc(sku(r.l)||'No SKU')+'</small></td><td>€'+r.cost.toFixed(2)+'</td><td>'+(r.match?esc(((r.match.manufacturer||'')+' '+(r.match.model||'')).trim())+'<br><small>'+r.matchType+'</small>':'Not in products')+'</td><td><select data-i="'+r.i+'"><option value="update" '+(r.action==='update'?'selected':'')+' '+(!r.match?'disabled':'')+'>Update existing cost</option><option value="add" '+(r.action==='add'?'selected':'')+'>Add as new product</option><option value="ignore" '+(r.action==='ignore'?'selected':'')+'>Ignore</option></select></td></tr>').join('')+'</tbody></table></div><div class="formactions"><button class="ghost" data-x>Cancel</button><button class="primary" data-save>Apply products</button></div></div>';document.body.appendChild(box);box.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>box.remove());box.querySelector('[data-save]').onclick=()=>{let c={};box.querySelectorAll('select[data-i]').forEach(s=>c[s.dataset.i]=s.value);let result=csApplySupplierProducts(inv,c);box.remove();alert(result.added+' new products added. '+result.updated+' existing costs updated.');if(onDone)onDone(result)};};
})();
