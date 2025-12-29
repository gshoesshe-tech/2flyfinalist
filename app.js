import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__;
const $app = document.getElementById("app");

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function showFatal(msg){
  $app.innerHTML = `<div class="container"><div class="error"><div class="h2">App error</div>
  <div class="mono" style="margin-top:8px">${esc(msg)}</div><div class="small" style="margin-top:8px">Open DevTools Console for details.</div></div></div>`;
}
window.addEventListener("error",(e)=>showFatal(e?.message||e?.error||"Unknown error"));
window.addEventListener("unhandledrejection",(e)=>showFatal(e?.reason||"Unhandled rejection"));

if(!SUPABASE_URL||!SUPABASE_ANON_KEY||String(SUPABASE_URL).includes("YOUR_PROJECT_REF")){
  showFatal("Missing config. Open /config.js and set __SUPABASE_URL__ and __SUPABASE_ANON_KEY__.");
  throw new Error("Missing config");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function money(n){const v=Number(n||0);return "₱"+v.toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:0});}
function qs(){const h=location.hash||"#/orders";const [path,q]=h.split("?");return {path, params:new URLSearchParams(q||"")};}
function title(path){return {"#/orders":"Orders","#/new-order":"New Order","#/inventory":"Inventory","#/commissions":"Commissions","#/products":"Products","#/finance":"Finance","#/dashboard":"Dashboard"}[path]||"2FLY Internal";}
function subtitle(path,role){
  const o = role==="owner"||role==="admin";
  if(path==="#/orders") return o ? "Owner sees more pages. Staff can view all orders and update status." : "Staff can view all orders and update status.";
  if(path==="#/new-order") return "Log orders with items; online orders compute shipping + commission automatically.";
  if(path==="#/inventory") return "Stock by SKU. Owner can adjust; staff is view-only.";
  if(path==="#/commissions") return "Online orders only. Commission is % of shipping profit.";
  if(path==="#/products") return "Owner-only: add/edit/activate products.";
  if(path==="#/finance") return "Owner-only: expenses, receivables, payables.";
  if(path==="#/dashboard") return "Owner-only: profit summaries.";
  return "";
}
function layout({role,name,content,rightAction=""}){
  const nav = [
    ["#/orders","Orders",["staff","owner","admin"]],
    ["#/new-order","New Order",["staff","owner","admin"]],
    ["#/inventory","Inventory",["staff","owner","admin"]],
    ["#/commissions","Commissions",["staff","owner","admin"]],
    ["#/products","Products",["owner","admin"]],
    ["#/finance","Finance",["owner","admin"]],
    ["#/dashboard","Dashboard",["owner","admin"]],
  ].filter(x=>x[2].includes(role)).map(x=>`<a data-nav href="${x[0]}">${x[1]}</a>`).join("");
  return `<div class="container"><div class="shell">
    <div class="sidebar">
      <div class="brand"><div><div class="title">2FLY Internal</div><div class="small">Admin-only system</div></div><div class="badge">${esc(role.toUpperCase())}</div></div>
      <div class="notice"><div class="small">Hi, <b>${esc(name||"user")}</b></div>${(role==="owner"||role==="admin")?`<div class="small">Owner access enabled.</div>`:`<div class="small">Staff can view all orders & update status.</div>`}</div>
      <div class="nav">${nav}</div>
      <div class="footer"><button class="btn danger" id="logoutBtn">Logout</button><div class="small" style="margin-top:10px">Internal use only.</div></div>
    </div>
    <div class="panel">
      <div class="row"><div><div class="h1">${esc(title(qs().path))}</div><div class="small">${esc(subtitle(qs().path,role))}</div></div><div>${rightAction}</div></div>
      <div class="hr"></div>${content}
    </div></div></div>`;
}

function loginView(err=""){
  return `<div class="container"><div class="panel" style="max-width:520px;margin:0 auto">
    <div class="h1">2FLY Internal</div><div class="small">Login with your account</div>
    ${err?`<div class="error">${esc(err)}</div>`:`<div class="notice">Use email/password from Supabase Auth. Make sure your role is set in <span class="mono">profiles</span>.</div>`}
    <div class="grid" style="margin-top:12px">
      <div class="field"><label>Email</label><input class="input" id="email" placeholder="you@email.com"/></div>
      <div class="field"><label>Password</label><input class="input" id="password" type="password" placeholder="••••••••"/></div>
      <button class="btn primary" id="loginBtn">Login</button>
    </div>
    <div class="small" style="margin-top:10px">If it later turns blank on Netlify: force "Clear cache and deploy", and ensure config.js is committed.</div>
  </div></div>`;
}

async function getProfile(uid){
  const {data,error}=await supabase.from("profiles").select("id,role,display_name,commission_rate").eq("id",uid).maybeSingle();
  if(error) throw error; return data;
}

function setActiveNav(path){document.querySelectorAll("[data-nav]").forEach(a=>a.classList.toggle("active",a.getAttribute("href")===path));}
function parseType(){const a=document.querySelector(".pill.active[data-type]");return a?a.getAttribute("data-type"):"online";}

async function ordersPage(role){
  return `<div class="notice">Staff can view all orders and update status. Owner sees more pages.</div>
  <div class="pills" id="orderTypePills">
    <div class="pill active" data-type="online">ONLINE</div>
    <div class="pill" data-type="lalamove">LALAMOVE</div>
    <div class="pill" data-type="walkin">WALKIN</div>
    <div class="pill" data-type="tiktok">TIKTOK</div>
  </div>
  <div id="ordersError"></div>
  <table class="table" style="margin-top:12px">
    <thead><tr><th style="width:220px">Order</th><th style="width:160px">Status</th><th>Customer</th><th style="width:260px">Shipping / Contact</th><th style="width:160px">Actions</th></tr></thead>
    <tbody id="ordersTbody"><tr><td colspan="5" class="small">Loading…</td></tr></tbody>
  </table>`;
}

async function fetchOrders(type){
  const {data,error}=await supabase.from("orders_board").select("*").eq("order_type",type).order("created_at",{ascending:false}).limit(200);
  if(error) throw error; return data||[];
}
function ordersRow(o){
  const ship=(o.order_type==="online")?`${esc(o.region||"")} • paid ${money(o.shipping_paid||0)}`:"No shipping";
  const contact=o.phone_number?` • ${esc(o.phone_number)}`:"";
  const link=o.profile_link?` • <a class="small" href="${esc(o.profile_link)}" target="_blank">FB</a>`:"";
  const sel=`<select class="input" data-status="${esc(o.id)}" style="padding:8px 10px;border-radius:12px">
    ${["pending","paid","packed","shipped","completed","cancelled"].map(s=>`<option value="${s}" ${String(o.status).toLowerCase()===s?"selected":""}>${s}</option>`).join("")}
  </select>`;
  return `<tr>
    <td><div class="mono">${esc(o.order_code||"")}</div><div class="small">${new Date(o.created_at).toLocaleString()}</div></td>
    <td>${sel}</td>
    <td><div>${esc(o.customer_name||"")}</div><div class="small">${esc(o.created_by_name||"")}</div></td>
    <td><div class="small">${ship}${contact}${link}</div></td>
    <td><button class="btn" data-save-status="${esc(o.id)}">Save</button></td>
  </tr>`;
}
async function refreshOrders(){
  const type=parseType();
  const err=document.getElementById("ordersError"); const tbody=document.getElementById("ordersTbody");
  try{
    if(err) err.innerHTML="";
    const rows=await fetchOrders(type);
    tbody.innerHTML = rows.length ? rows.map(ordersRow).join("") : `<tr><td colspan="5" class="small">No orders yet.</td></tr>`;
  }catch(e){
    tbody.innerHTML = `<tr><td colspan="5" class="small">Failed to load.</td></tr>`;
    if(err) err.innerHTML = `<div class="error">${esc(e.message||String(e))}

Fix: create view public.orders_board and reload schema cache.</div>`;
  }
}
function bindOrders(){
  document.getElementById("orderTypePills")?.addEventListener("click",async(e)=>{
    const t=e.target?.closest?.(".pill[data-type]"); if(!t) return;
    document.querySelectorAll(".pill[data-type]").forEach(p=>p.classList.remove("active"));
    t.classList.add("active"); await refreshOrders();
  });
  document.addEventListener("click",async(e)=>{
    const b=e.target?.closest?.("[data-save-status]"); if(!b) return;
    const id=b.getAttribute("data-save-status");
    const sel=document.querySelector(`select[data-status="${CSS.escape(id)}"]`);
    const status=sel?.value; b.disabled=true;
    try{
      const {error}=await supabase.rpc("staff_update_status",{p_order_id:id,p_status:status});
      if(error) throw error;
      await refreshOrders();
    }catch(err){alert(err.message||String(err))}
    finally{b.disabled=false;}
  });
  refreshOrders();
}

let cachedProducts=null;
async function loadProducts(){
  if(cachedProducts) return cachedProducts;
  const {data,error}=await supabase.from("products").select("sku,name,category,unit_cost,sell_price,active").eq("active",true).order("category",{ascending:true}).order("sku",{ascending:true});
  if(error) throw error;
  cachedProducts=data||[]; return cachedProducts;
}
function productOptions(ps){return ps.map(p=>`<option value="${esc(p.sku)}">${esc(p.sku)} — ${esc(p.name)} (${esc(p.category)})</option>`).join("")}

async function newOrderPage(){
  const ps=await loadProducts().catch(()=>[]);
  return `<div class="pills" id="newOrderTypePills">
      <div class="pill active" data-type="online">ONLINE</div>
      <div class="pill" data-type="lalamove">LALAMOVE</div>
      <div class="pill" data-type="walkin">WALKIN</div>
      <div class="pill" data-type="tiktok">TIKTOK</div>
    </div>
    <div id="newOrderError"></div>
    <div class="grid two" style="margin-top:12px">
      <div class="field"><label>Customer name *</label><input class="input" id="customerName" placeholder="Customer name"/></div>
      <div class="field"><label>Facebook profile link</label><input class="input" id="profileLink" placeholder="https://facebook.com/..."/></div>
      <div class="field" id="phoneWrap" style="display:none"><label>Phone number (walk-in required)</label><input class="input" id="phoneNumber" placeholder="09xxxxxxxxx"/></div>
      <div class="field" id="regionWrap"><label>Region (Online only)</label>
        <select class="input" id="region">
          <option value="">Select…</option>
          <option value="luzon">Luzon (courier ₱54)</option>
          <option value="visayas">Visayas (courier ₱79)</option>
          <option value="mindanao">Mindanao (courier ₱79)</option>
        </select>
      </div>
      <div class="field" id="shippingPaidWrap"><label>Shipping paid (Online only)</label><input class="input" id="shippingPaid" type="number" min="0" step="1" placeholder="e.g. 200"/></div>
    </div>
    <div class="hr"></div>
    <div class="row"><div><div class="h2">Items</div><div class="small">Add as many SKUs as needed.</div></div><button class="btn" id="addItemRow">+ Add item</button></div>
    <table class="table" style="margin-top:12px">
      <thead><tr><th style="width:260px">SKU</th><th>Item</th><th style="width:110px">Qty</th><th style="width:130px">Price</th><th style="width:70px"></th></tr></thead>
      <tbody id="itemsTbody"></tbody>
    </table>
    <div class="row" style="margin-top:14px"><button class="btn primary" id="submitOrder">Submit Order</button><div class="small" id="submitHint"></div></div>
    <div class="small" style="margin-top:10px">Submitting calls RPC <span class="mono">create_order_v2</span>.</div>
    <template id="itemRowTpl"><tr>
      <td><select class="input skuSel">${ps.length?productOptions(ps):`<option value="">(No products)</option>`}</select></td>
      <td class="small itemName"></td>
      <td><input class="input qtyInp" type="number" min="1" step="1" value="1"/></td>
      <td class="small itemPrice"></td>
      <td><button class="btn danger removeBtn" type="button">X</button></td>
    </tr></template>`;
}

function bindNewOrder(){
  const pills=document.getElementById("newOrderTypePills");
  const regionWrap=document.getElementById("regionWrap");
  const shipWrap=document.getElementById("shippingPaidWrap");
  const phoneWrap=document.getElementById("phoneWrap");
  const apply=()=>{
    const t=parseType();
    const isOnline=t==="online";
    regionWrap.style.display=isOnline?"block":"none";
    shipWrap.style.display=isOnline?"block":"none";
    phoneWrap.style.display=(t==="walkin")?"block":"none";
  };
  pills?.addEventListener("click",(e)=>{
    const t=e.target?.closest?.(".pill[data-type]"); if(!t) return;
    document.querySelectorAll("#newOrderTypePills .pill").forEach(p=>p.classList.remove("active"));
    t.classList.add("active"); apply();
  });

  const tbody=document.getElementById("itemsTbody"); const tpl=document.getElementById("itemRowTpl");
  const wire=(tr)=>{
    const skuSel=tr.querySelector(".skuSel"); const nameTd=tr.querySelector(".itemName"); const priceTd=tr.querySelector(".itemPrice");
    const rm=tr.querySelector(".removeBtn");
    const refresh=()=>{
      const sku=skuSel.value; const p=(cachedProducts||[]).find(x=>x.sku===sku);
      nameTd.textContent=p?`${p.name} • ${p.category}`:"";
      priceTd.textContent=p?money(p.sell_price):"";
    };
    skuSel.addEventListener("change",refresh); rm.onclick=()=>tr.remove(); refresh();
  };
  const addRow=()=>{const node=tpl.content.cloneNode(true); tbody.appendChild(node); wire(tbody.lastElementChild);};
  document.getElementById("addItemRow")?.addEventListener("click",addRow);
  addRow(); addRow(); apply();

  document.getElementById("submitOrder")?.addEventListener("click",async()=>{
    const errBox=document.getElementById("newOrderError"); const btn=document.getElementById("submitOrder"); const hint=document.getElementById("submitHint");
    errBox.innerHTML=""; hint.textContent=""; btn.disabled=true;
    try{
      const type=parseType();
      const customer_name=document.getElementById("customerName").value.trim();
      const profile_link=document.getElementById("profileLink").value.trim()||null;
      const phone_number=(document.getElementById("phoneNumber")?.value||"").trim()||null;
      const region=document.getElementById("region")?.value||null;
      const shipping_paid=Number(document.getElementById("shippingPaid")?.value||0);
      if(!customer_name) throw new Error("Customer name is required.");
      if(type==="online" && !region) throw new Error("Region is required for Online orders.");
      if(type==="walkin" && !phone_number) throw new Error("Phone number is required for Walk-in orders.");
      const items=[];
      tbody.querySelectorAll("tr").forEach(tr=>{
        const sku=tr.querySelector(".skuSel")?.value;
        const qty=Number(tr.querySelector(".qtyInp")?.value||0);
        if(sku && qty>0) items.push({sku,qty});
      });
      if(!items.length) throw new Error("Add at least 1 item.");
      hint.textContent="Submitting…";
      const {error}=await supabase.rpc("create_order_v2",{
        p_order_type:type,p_region:region,p_shipping_paid:(type==="online"?shipping_paid:0),
        p_customer_name:customer_name,p_profile_link:profile_link,p_phone_number:phone_number,
        p_notes:null,p_items:items
      });
      if(error) throw error;
      hint.textContent="Saved. Redirecting…";
      location.hash="#/orders";
      await boot();
    }catch(e){
      errBox.innerHTML=`<div class="error">${esc(e.message||String(e))}</div>`;
    }finally{btn.disabled=false;}
  });
}

async function inventoryPage(role){
  const isOwner=role==="owner"||role==="admin";
  return `<div class="notice">${isOwner?"Owner can adjust stock. Staff is view-only.":"View-only inventory."}</div>
    <div class="grid two">
      <div class="field"><label>Search SKU / name</label><input class="input" id="invSearch" placeholder="e.g. SBG-BLK"/></div>
      ${isOwner?`<div class="field"><label>Adjust stock (Owner only)</label>
        <div class="grid three" style="grid-template-columns:1fr 1fr auto">
          <input class="input" id="adjSku" placeholder="SKU"/><input class="input" id="adjQty" type="number" step="1" placeholder="+10 / -5"/>
          <button class="btn primary" id="adjBtn">Apply</button>
        </div></div>`:`<div></div>`}
    </div>
    <div id="invError"></div>
    <table class="table" style="margin-top:12px"><thead><tr><th style="width:220px">SKU</th><th>Product</th><th style="width:140px">Category</th><th style="width:120px">On hand</th></tr></thead>
    <tbody id="invTbody"><tr><td colspan="4" class="small">Loading…</td></tr></tbody></table>`;
}
let invCache=null;
async function fetchInventory(){
  const {data,error}=await supabase.from("inventory_view").select("*").order("category",{ascending:true}).order("sku",{ascending:true}).limit(5000);
  if(error) throw error; return data||[];
}
async function refreshInventory(){
  const err=document.getElementById("invError"); const tbody=document.getElementById("invTbody");
  const q=(document.getElementById("invSearch")?.value||"").trim().toLowerCase();
  try{
    if(!invCache) invCache=await fetchInventory();
    err.innerHTML="";
    const rows=invCache.filter(r=>!q||String(r.sku).toLowerCase().includes(q)||String(r.name||"").toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map(r=>`<tr><td class="mono">${esc(r.sku)}</td><td>${esc(r.name||"")}</td><td class="small">${esc(r.category||"")}</td><td><b>${esc(r.qty_on_hand??0)}</b></td></tr>`).join("")
      : `<tr><td colspan="4" class="small">No matches.</td></tr>`;
  }catch(e){
    tbody.innerHTML=`<tr><td colspan="4" class="small">Failed.</td></tr>`;
    err.innerHTML=`<div class="error">${esc(e.message||String(e))}

Fix: create view public.inventory_view and reload schema.</div>`;
  }
}
function bindInventory(){
  document.getElementById("invSearch")?.addEventListener("input",refreshInventory);
  document.getElementById("adjBtn")?.addEventListener("click",async()=>{
    const sku=(document.getElementById("adjSku").value||"").trim();
    const qty=Number(document.getElementById("adjQty").value||0);
    if(!sku||!Number.isFinite(qty)||qty===0) return alert("Enter SKU and non-zero qty.");
    try{
      const {error}=await supabase.rpc("owner_adjust_stock",{p_sku:sku,p_qty_change:qty,p_reason:"manual_adjust"});
      if(error) throw error;
      invCache=null; await refreshInventory(); alert("Updated.");
    }catch(e){alert(e.message||String(e));}
  });
  refreshInventory();
}

async function commissionsPage(){
  return `<div class="notice">Commission = your profile commission_rate × shipping profit (ONLINE only).</div>
    <div class="grid two"><div class="field"><label>Start</label><input class="input" id="cStart" type="date"/></div>
    <div class="field"><label>End</label><input class="input" id="cEnd" type="date"/></div></div>
    <button class="btn primary" id="cRefresh" style="margin-top:10px">Refresh</button>
    <div id="cError"></div>
    <table class="table" style="margin-top:12px"><thead><tr><th>Order</th><th>Date</th><th>Region</th><th>Shipping Paid</th><th>Commission</th></tr></thead>
    <tbody id="cTbody"><tr><td colspan="5" class="small">Select date range then refresh.</td></tr></tbody></table>`;
}
function bindCommissions(){
  const today=new Date(); const d1=new Date(today); d1.setDate(today.getDate()-30);
  document.getElementById("cStart").value=d1.toISOString().slice(0,10);
  document.getElementById("cEnd").value=today.toISOString().slice(0,10);
  document.getElementById("cRefresh")?.addEventListener("click",async()=>{
    const tbody=document.getElementById("cTbody"); const err=document.getElementById("cError");
    err.innerHTML=""; tbody.innerHTML=`<tr><td colspan="5" class="small">Loading…</td></tr>`;
    try{
      const {data,error}=await supabase.rpc("my_commission_report",{p_start:document.getElementById("cStart").value,p_end:document.getElementById("cEnd").value});
      if(error) throw error;
      tbody.innerHTML = (data||[]).length ? (data||[]).map(r=>`<tr><td class="mono">${esc(r.order_code||"")}</td><td class="small">${new Date(r.created_at).toLocaleString()}</td><td class="small">${esc(r.region||"")}</td><td>${money(r.shipping_paid)}</td><td><b>${money(r.commission)}</b></td></tr>`).join("")
        : `<tr><td colspan="5" class="small">No commissions in range.</td></tr>`;
    }catch(e){
      tbody.innerHTML=`<tr><td colspan="5" class="small">Failed.</td></tr>`;
      err.innerHTML=`<div class="error">${esc(e.message||String(e))}</div>`;
    }
  });
}

async function productsPage(){
  return `<div class="notice">Owner-only. Add/edit SKUs, costs and prices. Use Active toggle to archive.</div>
    <div class="grid two">
      <div class="field"><label>Search</label><input class="input" id="pSearch" placeholder="SKU / name"/></div>
      <div class="field"><label>Quick add</label><div class="grid three" style="grid-template-columns:1fr 1.4fr auto">
        <input class="input" id="pSku" placeholder="SKU"/><input class="input" id="pName" placeholder="Name"/><button class="btn primary" id="pAddBtn">Add</button>
      </div></div>
    </div>
    <div class="grid three" style="margin-top:10px">
      <div class="field"><label>Category</label><input class="input" id="pCat" placeholder="BOXER / EARRING / NECKLACE"/></div>
      <div class="field"><label>Unit cost</label><input class="input" id="pCost" type="number" step="0.01"/></div>
      <div class="field"><label>Sell price</label><input class="input" id="pPrice" type="number" step="0.01"/></div>
    </div>
    <div id="pError"></div>
    <table class="table" style="margin-top:12px"><thead><tr><th style="width:180px">SKU</th><th>Name</th><th style="width:140px">Category</th><th style="width:110px">Cost</th><th style="width:110px">Price</th><th style="width:110px">Active</th></tr></thead>
    <tbody id="pTbody"><tr><td colspan="6" class="small">Loading…</td></tr></tbody></table>`;
}
let prodCache=null;
async function fetchProductsAll(){const {data,error}=await supabase.from("products").select("*").order("category",{ascending:true}).order("sku",{ascending:true}).limit(5000); if(error) throw error; return data||[];}
async function refreshProducts(){
  const q=(document.getElementById("pSearch")?.value||"").trim().toLowerCase();
  const tbody=document.getElementById("pTbody"); const err=document.getElementById("pError"); err.innerHTML="";
  try{
    if(!prodCache) prodCache=await fetchProductsAll();
    const rows=prodCache.filter(p=>!q||String(p.sku).toLowerCase().includes(q)||String(p.name||"").toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map(p=>`<tr><td class="mono">${esc(p.sku)}</td><td>${esc(p.name||"")}</td><td class="small">${esc(p.category||"")}</td><td>${money(p.unit_cost)}</td><td>${money(p.sell_price)}</td><td><input type="checkbox" data-active="${esc(p.sku)}" ${p.active?"checked":""}/></td></tr>`).join("")
      : `<tr><td colspan="6" class="small">No matches.</td></tr>`;
  }catch(e){
    tbody.innerHTML=`<tr><td colspan="6" class="small">Failed.</td></tr>`;
    err.innerHTML=`<div class="error">${esc(e.message||String(e))}</div>`;
  }
}
function bindProducts(){
  document.getElementById("pSearch")?.addEventListener("input",refreshProducts);
  document.getElementById("pAddBtn")?.addEventListener("click",async()=>{
    const sku=(document.getElementById("pSku").value||"").trim();
    const name=(document.getElementById("pName").value||"").trim();
    const category=(document.getElementById("pCat").value||"").trim();
    const unit_cost=Number(document.getElementById("pCost").value||0);
    const sell_price=Number(document.getElementById("pPrice").value||0);
    if(!sku||!name||!category) return alert("SKU, Name, Category required.");
    try{
      const {error}=await supabase.from("products").insert([{sku,name,category,unit_cost,sell_price,active:true}]);
      if(error) throw error;
      prodCache=null; cachedProducts=null; await refreshProducts(); alert("Added.");
    }catch(e){alert(e.message||String(e))}
  });
  document.addEventListener("change",async(e)=>{
    const cb=e.target?.closest?.('input[type="checkbox"][data-active]'); if(!cb) return;
    const sku=cb.getAttribute("data-active");
    try{
      const {error}=await supabase.from("products").update({active:cb.checked}).eq("sku",sku);
      if(error) throw error;
      prodCache=null; cachedProducts=null; await refreshProducts();
    }catch(err){alert(err.message||String(err)); cb.checked=!cb.checked;}
  });
  refreshProducts();
}

async function financePage(){
  return `<div class="notice">Owner-only tracking. Expenses affect net after expenses.</div>
    <div class="grid three">
      <div class="kpi"><div class="label">Expenses (this month)</div><div class="value" id="kExp">—</div></div>
      <div class="kpi"><div class="label">Receivables outstanding</div><div class="value" id="kRec">—</div></div>
      <div class="kpi"><div class="label">Payables outstanding</div><div class="value" id="kPay">—</div></div>
    </div>
    <div class="hr"></div>
    <div class="grid two">
      <div><div class="h2">Add expense</div>
        <div class="grid" style="margin-top:10px">
          <div class="field"><label>Date</label><input class="input" id="eDate" type="date"/></div>
          <div class="field"><label>Category</label><input class="input" id="eCat" placeholder="Rent / Utilities / Packaging"/></div>
          <div class="field"><label>Amount</label><input class="input" id="eAmt" type="number" step="0.01"/></div>
          <div class="field"><label>Notes</label><input class="input" id="eNotes" placeholder="optional"/></div>
          <button class="btn primary" id="eAdd">Add expense</button>
        </div>
      </div>
      <div><div class="h2">Add receivable / payable</div>
        <div class="grid" style="margin-top:10px">
          <div class="field"><label>Type</label><select class="input" id="apType"><option value="receivable">Receivable</option><option value="payable">Payable</option></select></div>
          <div class="field"><label>Party</label><input class="input" id="apParty" placeholder="Customer / Supplier / Staff"/></div>
          <div class="field"><label>Amount due</label><input class="input" id="apDue" type="number" step="0.01"/></div>
          <div class="field"><label>Amount paid</label><input class="input" id="apPaid" type="number" step="0.01" value="0"/></div>
          <div class="field"><label>Status</label><select class="input" id="apStatus"><option value="open">open</option><option value="partial">partial</option><option value="closed">closed</option></select></div>
          <button class="btn primary" id="apAdd">Add</button>
        </div>
      </div>
    </div>
    <div id="finError"></div>`;
}
function bindFinance(){
  const now=new Date();
  const first=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
  document.getElementById("eDate").value=new Date().toISOString().slice(0,10);

  const load=async()=>{
    const err=document.getElementById("finError"); err.innerHTML="";
    try{
      const end=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().slice(0,10);
      const {data,error}=await supabase.rpc("owner_dashboard_summary",{p_start:first,p_end:end});
      if(error) throw error;
      const r=(data&&data[0])||{};
      document.getElementById("kExp").textContent=money(r.expenses_total);
      document.getElementById("kRec").textContent=money(r.receivables_outstanding);
      document.getElementById("kPay").textContent=money(r.payables_outstanding);
    }catch(e){err.innerHTML=`<div class="error">${esc(e.message||String(e))}</div>`;}
  };

  document.getElementById("eAdd")?.addEventListener("click",async()=>{
    try{
      const expense_date=document.getElementById("eDate").value;
      const category=(document.getElementById("eCat").value||"").trim();
      const amount=Number(document.getElementById("eAmt").value||0);
      const notes=(document.getElementById("eNotes").value||"").trim()||null;
      if(!expense_date||!category||!amount) return alert("Date, category, amount required.");
      const {error}=await supabase.from("expenses").insert([{expense_date,category,amount,notes}]);
      if(error) throw error;
      alert("Expense added."); await load();
    }catch(e){alert(e.message||String(e))}
  });

  document.getElementById("apAdd")?.addEventListener("click",async()=>{
    try{
      const type=document.getElementById("apType").value;
      const party=(document.getElementById("apParty").value||"").trim();
      const amount_due=Number(document.getElementById("apDue").value||0);
      const amount_paid=Number(document.getElementById("apPaid").value||0);
      const status=document.getElementById("apStatus").value;
      if(!party||!amount_due) return alert("Party and amount due required.");
      if(type==="receivable"){
        const {error}=await supabase.from("receivables").insert([{party,amount_due,amount_paid,status}]);
        if(error) throw error;
      }else{
        const {error}=await supabase.from("payables").insert([{party,amount:amount_due,status,notes:null}]);
        if(error) throw error;
      }
      alert("Added."); await load();
    }catch(e){alert(e.message||String(e))}
  });

  load();
}

async function dashboardPage(){
  return `<div class="notice">If values show 0, it means financial rows are empty. Create orders to auto-generate them.</div>
    <div class="grid two"><div class="field"><label>Start</label><input class="input" id="dStart" type="date"/></div><div class="field"><label>End</label><input class="input" id="dEnd" type="date"/></div></div>
    <button class="btn primary" id="dRefresh" style="margin-top:10px">Refresh</button>
    <div class="grid three" style="margin-top:12px">
      <div class="kpi"><div class="label">Items revenue</div><div class="value" id="kRev">—</div></div>
      <div class="kpi"><div class="label">COGS</div><div class="value" id="kCogs">—</div></div>
      <div class="kpi"><div class="label">Order profit</div><div class="value" id="kProfit">—</div></div>
      <div class="kpi"><div class="label">Shipping profit</div><div class="value" id="kShip">—</div></div>
      <div class="kpi"><div class="label">Commission (to pay)</div><div class="value" id="kCom">—</div></div>
      <div class="kpi"><div class="label">Net after expenses</div><div class="value" id="kNet">—</div></div>
    </div>
    <div id="dError"></div>
    <div class="hr"></div><div class="h2">Profit by Order Type</div>
    <table class="table" style="margin-top:10px"><thead><tr><th>Order type</th><th>Profit</th></tr></thead><tbody id="dTypeTbody"><tr><td colspan="2" class="small">—</td></tr></tbody></table>
    <div class="hr"></div><div class="h2">Profit by Category</div>
    <table class="table" style="margin-top:10px"><thead><tr><th>Category</th><th>Profit</th></tr></thead><tbody id="dCatTbody"><tr><td colspan="2" class="small">—</td></tr></tbody></table>`;
}
function bindDashboard(){
  const now=new Date(); const start=new Date(now); start.setDate(now.getDate()-30);
  document.getElementById("dStart").value=start.toISOString().slice(0,10);
  document.getElementById("dEnd").value=now.toISOString().slice(0,10);

  document.getElementById("dRefresh")?.addEventListener("click",async()=>{
    const err=document.getElementById("dError"); err.innerHTML="";
    try{
      const p_start=document.getElementById("dStart").value; const p_end=document.getElementById("dEnd").value;
      const s=await supabase.rpc("owner_dashboard_summary",{p_start,p_end}); if(s.error) throw s.error;
      const r=(s.data&&s.data[0])||{};
      document.getElementById("kRev").textContent=money(r.items_revenue);
      document.getElementById("kCogs").textContent=money(r.items_cogs);
      document.getElementById("kProfit").textContent=money(r.order_profit);
      document.getElementById("kShip").textContent=money(r.shipping_profit);
      document.getElementById("kCom").textContent=money(r.commission_total);
      document.getElementById("kNet").textContent=money(r.net_after_expenses);

      const t=await supabase.rpc("owner_summary_by_order_type",{p_start,p_end}); if(t.error) throw t.error;
      document.getElementById("dTypeTbody").innerHTML=(t.data||[]).length?(t.data||[]).map(x=>`<tr><td>${esc(x.order_type)}</td><td><b>${money(x.order_profit)}</b></td></tr>`).join(""):`<tr><td colspan="2" class="small">No data.</td></tr>`;

      const c=await supabase.rpc("owner_profit_by_category",{p_start,p_end}); if(c.error) throw c.error;
      document.getElementById("dCatTbody").innerHTML=(c.data||[]).length?(c.data||[]).map(x=>`<tr><td>${esc(x.category||"")}</td><td><b>${money(x.profit)}</b></td></tr>`).join(""):`<tr><td colspan="2" class="small">No data.</td></tr>`;
    }catch(e){err.innerHTML=`<div class="error">${esc(e.message||String(e))}</div>`;}
  });

  document.getElementById("dRefresh").click();
}

async function route(session,profile){
  if(!session){$app.innerHTML=loginView(); document.getElementById("loginBtn")?.addEventListener("click",async()=>{
    const email=(document.getElementById("email").value||"").trim();
    const password=(document.getElementById("password").value||"").trim();
    if(!email||!password) return ($app.innerHTML=loginView("Enter email and password."));
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) return ($app.innerHTML=loginView(error.message));
    await boot();
  }); return;}

  const role=profile?.role||"staff"; const name=profile?.display_name||session.user.email;
  const isOwner=role==="owner"||role==="admin";
  const path=qs().path;

  if((path==="#/products"||path==="#/finance"||path==="#/dashboard") && !isOwner) location.hash="#/orders";

  let content="";
  let rightAction="";
  if(path==="#/orders"){content=await ordersPage(role); rightAction=`<a class="btn primary" href="#/new-order">+ New Order</a>`;}
  else if(path==="#/new-order"){content=await newOrderPage();}
  else if(path==="#/inventory"){content=await inventoryPage(role);}
  else if(path==="#/commissions"){content=await commissionsPage();}
  else if(path==="#/products"){content=await productsPage();}
  else if(path==="#/finance"){content=await financePage();}
  else if(path==="#/dashboard"){content=await dashboardPage();}
  else {location.hash="#/orders"; return;}

  $app.innerHTML = layout({role,name,content,rightAction});
  setActiveNav(qs().path);

  document.getElementById("logoutBtn")?.addEventListener("click",async()=>{await supabase.auth.signOut(); location.hash="#/orders"; await boot();});

  if(qs().path==="#/orders") bindOrders();
  if(qs().path==="#/new-order") bindNewOrder();
  if(qs().path==="#/inventory") bindInventory();
  if(qs().path==="#/commissions") bindCommissions();
  if(qs().path==="#/products") bindProducts();
  if(qs().path==="#/finance") bindFinance();
  if(qs().path==="#/dashboard") bindDashboard();
}

async function boot(){
  $app.innerHTML = `<div class="container"><div class="notice">Loading…</div></div>`;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){await route(null,null);return;}
  const profile=await getProfile(session.user.id);
  await route(session,profile);
}
window.addEventListener("hashchange",boot);
boot();
