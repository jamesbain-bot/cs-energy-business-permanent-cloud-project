const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8');
for(const [,script]of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);
function render(source,type,overrides={},settings={}){
 const names=['esc','iso','prettyDate','customer','eur','quoteTotals','docHeader','showBusinessDoc','invoiceNumber','paymentDetails'];if(source.includes('function quoteDocument('))names.push('quoteDocument');
 const code=names.map(name=>{const start=source.indexOf('function '+name+'(');assert(start>=0,name);const end=source.indexOf('function ',start+9);return source.slice(start,end<0?undefined:end)}).join('\n');
 const fixture={settings:{companyName:'CS Energy',companyAddress:'Sample address',companyTaxId:'DEMO',companyWeb:'example.test',companyPhone:'000',quoteFooter:'Existing terms\nSecond line',...settings},customers:[{id:'c',name:'Customer <script>unsafe</script>',address:'Address & town',taxId:'DEMO',email:'test@example.test',phone:'000'}],quotes:[{id:'q',customerId:'c',invoiceNo:'TEST-INV',ref:'Q-TEST',title:'Test project',scope:'Existing scope\nSecond line',depositPct:50,validDays:30,lines:[{description:'Panel <test>',qty:20,sell:250,cost:123},{description:'Battery',qty:2,sell:1250,cost:800}],...overrides}]};
 const elements={};const document={getElementById(id){return elements[id]||=( {innerHTML:'',textContent:'',classList:{add(){}}})}};let saved=0;
 vm.runInNewContext(`const data=${JSON.stringify(fixture)};const DEFAULT_COMPANY_LOGO='test-logo';${code};showBusinessDoc('q','${type}');`,{document,Date,Intl,save(){saved++}});
 assert.equal(saved,0,'Must not save customer/quote state');assert.equal(elements.reportPrintHost.innerHTML,elements.businessDocContent.innerHTML);return elements.businessDocContent.innerHTML;
}
const quote=render(source,'quote');for(const text of ['€7,500.00','€1,575.00','€9,075.00','€4,537.50','50%','30 days','Panel &lt;test&gt;','Customer &lt;script&gt;unsafe&lt;/script&gt;','Existing terms\nSecond line','Existing scope\nSecond line','Q-TEST'])assert(quote.includes(text),text);
assert(!quote.includes('<script>'));assert(!quote.includes('€123'));assert(quote.includes('doc-report quote-document'));
for(const type of ['deposit','balance','invoice','contract'])assert(!render(source,type).includes('quote-document'));
const baseline=process.env.QUOTE_BASELINE;if(baseline){const old=fs.readFileSync(baseline,'utf8');for(const type of ['deposit','balance','invoice','contract'])assert.equal(render(source,type),render(old,type),type+' changed');console.log('PASS nonquote HTML byte-for-byte baseline equality');}
console.log('PASS all inline script syntax, escaped values, exact quote totals/IVA/deposit/validity, hidden costs, no saves, print/preview equality');

const unsafeLogo=render(source,'quote',{}, {companyLogo:'logo.png" onerror="alert(1)'});assert(unsafeLogo.includes('src="logo.png&quot; onerror=&quot;alert(1)"'));assert(!unsafeLogo.includes('src="logo.png" onerror='));console.log('PASS saved logo URL attribute escaping');
