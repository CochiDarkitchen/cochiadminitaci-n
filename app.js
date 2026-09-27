/* ============================================================
   COCHI ADMINISTRACIÓN — app.js
   Reemplaza los dos valores de abajo por los de TU proyecto Supabase
   (Project Settings → API → Project URL / anon public key).
   La anon key NO es secreta: está pensada para vivir en el navegador,
   la seguridad real la da RLS (ver schema.sql). Nunca pongas aquí la
   service_role key.
   ============================================================ */
const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_SUPABASE_ANON_KEY";
const TZ = "America/Caracas";

const { createClient } = supabase;
let sb;
try{
  if(typeof supabase === "undefined") throw new Error("No se pudo cargar la librería de Supabase (¿sin conexión a internet?)");
  if(!SUPABASE_URL || SUPABASE_URL.indexOf("PEGA_AQUI") === 0) throw new Error("Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en app.js");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}catch(e){
  console.error(e);
}
function showFatalError(){
  const root=document.getElementById("root");
  if(root) root.innerHTML = `<div id="login"><div class="login-box">
    <h1>COCHI</h1>
    <p style="color:var(--red);margin-bottom:10px">No se pudo iniciar la aplicación.</p>
    <p style="font-size:13px;color:var(--dim)">Revisa que en <b>app.js</b> reemplazaste <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code> por los datos reales de tu proyecto (Project Settings → API en Supabase), y que hay conexión a internet. Abre la consola del navegador (F12) para ver el detalle técnico.</p>
  </div></div>`;
}

/* ---------- helpers ---------- */
function fmt$(n){ return "$"+Number(n||0).toFixed(2); }
function fmtBs(n){ return "Bs. "+Math.round((n||0)*(cache.config.exchange_rate||1)).toLocaleString("es-VE"); }
function todayCaracas(){ return new Date().toLocaleDateString("en-CA",{timeZone:TZ}); }
function dateCaracas(ts){ return ts ? new Date(ts).toLocaleDateString("en-CA",{timeZone:TZ}) : ""; }
function fmtDate(ts){ return ts ? new Date(ts).toLocaleDateString("es-VE",{timeZone:TZ}) : ""; }
function fmtTime(ts){ return ts ? new Date(ts).toLocaleTimeString("es-VE",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}) : ""; }

function toast(msg, isError){
  let t = document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = isError ? "toast err show" : "toast show";
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove("show"), isError?4000:2200);
}
function friendlyError(e){
  console.error(e);
  const msg = (e && e.message) || "";
  if(msg.includes("Stock insuficiente")) return msg;
  if(msg.includes("no encontrado")) return msg;
  if(msg.toLowerCase().includes("invalid login")) return "Correo o contraseña incorrectos";
  if(msg.toLowerCase().includes("failed to fetch")) return "Sin conexión a internet. Intenta de nuevo.";
  return "Ocurrió un error al procesar la información. Intenta nuevamente.";
}

/* ---------- capa de datos (Supabase) ---------- */
const Api = {
  async list(table, order){
    let q = sb.from(table).select("*");
    if(order) q = q.order(order.col, {ascending: !!order.asc});
    const {data, error} = await q; if(error) throw error; return data;
  },
  async insert(table, val){ const {data,error}=await sb.from(table).insert(val).select().single(); if(error) throw error; return data; },
  async update(table, id, val){ const {data,error}=await sb.from(table).update(val).eq("id",id).select().single(); if(error) throw error; return data; },
  async remove(table, id){ const {error}=await sb.from(table).delete().eq("id",id); if(error) throw error; }
};

let cache = { products:[], customers:[], orders:[], orderItemsAll:[], expenses:[], providers:[], zones:[], config:{name:"COCHI",phone:"",address:"",exchange_rate:1} };

async function loadProducts(){ cache.products = await Api.list("products",{col:"name",asc:true}); }
async function loadCustomers(){ cache.customers = await Api.list("customers",{col:"name",asc:true}); }
async function loadOrders(){
  const {data,error} = await sb.from("orders").select("*, customers(name,phone,address)").order("order_number",{ascending:false});
  if(error) throw error; cache.orders = data;
}
async function loadOrderItemsAll(){
  const {data,error} = await sb.from("order_items").select("product_name, quantity, orders(status)");
  if(error) throw error; cache.orderItemsAll = data;
}
async function loadOrdersAndItems(){ await loadOrders(); await loadOrderItemsAll(); }
async function loadExpenses(){
  const {data,error} = await sb.from("expenses").select("*, providers(name)").order("expense_date",{ascending:false});
  if(error) throw error; cache.expenses = data;
}
async function loadProviders(){ cache.providers = await Api.list("providers",{col:"name",asc:true}); }
async function loadZones(){ cache.zones = await Api.list("delivery_zones",{col:"name",asc:true}); }
async function loadConfig(){ const {data,error}=await sb.from("config").select("*").eq("id",1).single(); if(error) throw error; cache.config=data; }
async function loadAll(){ await Promise.all([loadProducts(),loadCustomers(),loadOrdersAndItems(),loadExpenses(),loadProviders(),loadZones(),loadConfig()]); }

let realtimeStarted = false;
function watch(table, loader){
  sb.channel("rt-"+table).on("postgres_changes", {event:"*", schema:"public", table}, ()=>{ loader().then(render).catch(e=>console.error(e)); }).subscribe();
}
function initRealtime(){
  if(realtimeStarted) return; realtimeStarted = true;
  watch("products", loadProducts); watch("customers", loadCustomers);
  watch("orders", loadOrdersAndItems); watch("order_items", loadOrdersAndItems);
  watch("expenses", loadExpenses); watch("providers", loadProviders);
  watch("delivery_zones", loadZones); watch("config", loadConfig);
}

/* ---------- estado ---------- */
let state = { user:null, route:"loading", modal:null, orderCart:[], orderCustomer:null, orderZone:"", orderDiscount:0, orderNotes:"", filterStatus:"", search:"" };

async function initApp(){
  try{ await loadAll(); initRealtime(); render(); }
  catch(e){ toast(friendlyError(e), true); render(); }
}

/* ---------- RENDER ---------- */
function render(){
  const root=document.getElementById("root");
  if(state.route==="loading"){ root.innerHTML = `<div id="login"><div class="login-box c" style="text-align:center">Cargando…</div></div>`; return; }
  root.innerHTML = state.route==="login" ? loginView() : shellView();
  wireLogin(); wireShell();
  if(state.modal) openModal(state.modal);
}

function loginView(){
  return `<div id="login"><div class="login-box">
    <h1>COCHI</h1><p>Panel de administración</p>
    <div class="field"><label>Correo</label><input id="lu" type="email" placeholder="admin@cochi.com"></div>
    <div class="field"><label>Contraseña</label><input id="lp" type="password" placeholder="••••••"></div>
    <button class="btn-primary" id="lbtn" style="width:100%">Iniciar sesión</button>
    <div class="login-err" id="lerr"></div>
  </div></div>`;
}
function wireLogin(){
  if(state.route!=="login") return;
  const btn=document.getElementById("lbtn");
  const doLogin=async ()=>{
    const email=document.getElementById("lu").value.trim(), password=document.getElementById("lp").value;
    document.getElementById("lerr").textContent="";
    if(!email||!password){ document.getElementById("lerr").textContent="Ingresa tu correo y contraseña"; return; }
    btn.disabled=true; btn.textContent="Ingresando...";
    const {error} = await sb.auth.signInWithPassword({email,password});
    btn.disabled=false; btn.textContent="Iniciar sesión";
    if(error) document.getElementById("lerr").textContent = friendlyError(error);
  };
  btn.onclick=doLogin;
  document.getElementById("lp").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
}

const NAV = [["dashboard","📊 Dashboard"],["ordenes","🧾 Órdenes"],["productos","🍗 Productos"],["clientes","👤 Clientes"],["gastos","💸 Gastos"],["proveedores","🏭 Proveedores"],["config","⚙️ Configuración"]];

function shellView(){
  const views = { dashboard:dashboardView, ordenes:ordenesView, productos:productosView, clientes:clientesView, gastos:gastosView, proveedores:proveedoresView, config:configView };
  const body = (views[state.route]||dashboardView)();
  return `<div id="shell">
    <div id="sidebar">
      <h1>COCHI</h1><div class="tag">Administración</div>
      ${NAV.map(([k,l])=>`<button class="nav-item ${state.route===k?'active':''}" data-nav="${k}">${l}</button>`).join("")}
      <button class="btn-ghost" id="logout">Cerrar sesión</button>
    </div>
    <main>${body}</main>
    <div id="mobile-nav">${NAV.map(([k,l])=>{ const sp=l.indexOf(" "); const icon=l.slice(0,sp), label=l.slice(sp+1); return `<button class="${state.route===k?'active':''}" data-nav="${k}"><span style="font-size:18px">${icon}</span><span style="font-size:9px">${label}</span></button>`; }).join("")}</div>
  </div>`;
}
function wireShell(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{ state.route=b.dataset.nav; state.modal=null; state.search=""; state.filterStatus=""; render(); });
  const lo=document.getElementById("logout"); if(lo) lo.onclick=()=>sb.auth.signOut();
}

/* ---------- DASHBOARD ---------- */
function dashboardView(){
  const orders = cache.orders;
  const t = todayCaracas();
  const todays = orders.filter(o=>dateCaracas(o.order_date)===t && o.status!=="cancelada");
  const ventasHoy = todays.reduce((s,o)=>s+Number(o.total),0);
  const pendientes = orders.filter(o=>["pendiente","preparacion","lista","delivery"].includes(o.status)).length;
  const completadasHoy = orders.filter(o=>dateCaracas(o.order_date)===t && o.status==="completada").length;
  const clientes = cache.customers.length;
  const sales={};
  (cache.orderItemsAll||[]).forEach(it=>{ if(it.orders && it.orders.status!=="cancelada"){ sales[it.product_name]=(sales[it.product_name]||0)+it.quantity; } });
  const ranked = Object.entries(sales).sort((a,b)=>b[1]-a[1]);
  const top = ranked.slice(0,3);
  const bottom = ranked.slice(-3).reverse().filter(r=>!top.some(t2=>t2[0]===r[0]));
  const maxQty = ranked.length ? ranked[0][1] : 1;
  const bar=(name,qty)=>`<div class="summary-line"><span>${name}</span><span style="display:flex;align-items:center;gap:8px"><span style="background:var(--accent);height:6px;width:${Math.max(6,Math.round((qty/maxQty)*80))}px;border-radius:3px;display:inline-block"></span>${qty}</span></div>`;
  return `<div class="topbar"><h2>Dashboard</h2></div>
  <div class="cards">
    <div class="card"><div class="label">Ventas de hoy</div><div class="val">${fmt$(ventasHoy)}</div><div class="sub">${fmtBs(ventasHoy)}</div></div>
    <div class="card"><div class="label">Órdenes de hoy</div><div class="val">${todays.length}</div><div class="sub">${completadasHoy} completadas</div></div>
    <div class="card"><div class="label">Órdenes pendientes</div><div class="val">${pendientes}</div><div class="sub">en todo el sistema</div></div>
    <div class="card"><div class="label">Clientes registrados</div><div class="val">${clientes}</div></div>
  </div>
  <div class="row2" style="margin-bottom:24px">
    <div class="panel" style="padding:18px"><div style="color:var(--dim);font-size:14px;margin-bottom:8px">Más vendidos</div>
      ${top.map(([n,q])=>bar(n,q)).join("") || '<div class="empty" style="padding:16px">Aún no hay ventas registradas</div>'}</div>
    <div class="panel" style="padding:18px"><div style="color:var(--dim);font-size:14px;margin-bottom:8px">Menos vendidos</div>
      ${bottom.length ? bottom.map(([n,q])=>bar(n,q)).join("") : '<div class="empty" style="padding:16px">Aún no hay suficientes datos</div>'}</div>
  </div>
  <div class="panel" style="padding:18px">
    <div style="color:var(--dim);font-size:14px">Últimas órdenes</div>
    ${orders.slice(0,5).map(o=>`<div class="summary-line"><span>#${o.order_number} — ${o.customers?o.customers.name:"—"}</span><span>${fmt$(o.total)} · <span class="badge b-${o.status}">${statusLabel(o.status)}</span></span></div>`).join("") || '<div class="empty">Aún no hay órdenes</div>'}
  </div>`;
}

/* ---------- PRODUCTOS ---------- */
function productosView(){
  const items = cache.products.filter(p=>!state.search || p.name.toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="topbar"><h2>Productos</h2><button class="btn-primary" id="newProd">+ Nuevo producto</button></div>
  <div class="toolbar"><input id="pSearch" placeholder="Buscar producto..." value="${state.search}"></div>
  <div class="panel"><table><thead><tr><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead><tbody>
  ${items.map(p=>`<tr><td>${p.name}</td><td>${p.category||"—"}</td><td>${fmt$(p.price)} <span style="color:var(--dim)">/ ${fmtBs(p.price)}</span></td>
    <td>${p.stock===null||p.stock===undefined?"—":p.stock}</td>
    <td><span class="badge ${p.available?'b-completada':'b-cancelada'}">${p.available?'Disponible':'No disponible'}</span></td>
    <td style="text-align:right"><button class="btn-ghost btn-sm" data-edit-prod="${p.id}">Editar</button> <button class="btn-danger btn-sm" data-del-prod="${p.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">No hay productos</td></tr>'}
  </tbody></table></div>`;
}
function productFormHtml(p){
  p = p || {id:"",name:"",category:"",price:"",stock:"",available:true};
  return `<h3>${p.id?"Editar producto":"Nuevo producto"}</h3>
    <div class="field"><label>Nombre</label><input id="f-name" value="${p.name}"></div>
    <div class="row2">
      <div class="field"><label>Categoría</label><input id="f-cat" value="${p.category||""}" placeholder="Pollos, Bebidas..."></div>
      <div class="field"><label>Precio (USD)</label><input id="f-price" type="number" step="0.01" value="${p.price}"></div>
    </div>
    <div class="field"><label>Cantidad disponible (déjalo vacío si no llevas control de stock)</label><input id="f-stock" type="number" step="1" value="${p.stock??""}"></div>
    <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="f-avail" style="width:auto" ${p.available?"checked":""}> Disponible</label>
    <div class="modal-actions"><button class="btn-ghost" id="cancel">Cancelar</button><button class="btn-primary" id="save">Guardar</button></div>`;
}

/* ---------- CLIENTES ---------- */
function clientesView(){
  const items = cache.customers.filter(c=>!state.search || c.name.toLowerCase().includes(state.search.toLowerCase()) || (c.phone||"").includes(state.search));
  return `<div class="topbar"><h2>Clientes</h2><button class="btn-primary" id="newCust">+ Nuevo cliente</button></div>
  <div class="toolbar"><input id="pSearch" placeholder="Buscar por nombre o teléfono..." value="${state.search}"></div>
  <div class="panel"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Órdenes</th><th></th></tr></thead><tbody>
  ${items.map(c=>{ const n=cache.orders.filter(o=>o.customer_id===c.id).length;
    return `<tr><td>${c.name}</td><td>${c.phone||"—"}</td><td>${c.address||"—"}</td><td>${n}</td>
    <td style="text-align:right"><button class="btn-ghost btn-sm" data-edit-cust="${c.id}">Editar</button> <button class="btn-danger btn-sm" data-del-cust="${c.id}">Eliminar</button></td></tr>`;}).join("") || '<tr><td colspan="5" class="empty">No hay clientes</td></tr>'}
  </tbody></table></div>`;
}
function customerFormHtml(c){
  c = c || {id:"",name:"",phone:"",address:"",address_2:"",notes:""};
  return `<h3>${c.id?"Editar cliente":"Nuevo cliente"}</h3>
  <div class="field"><label>Nombre</label><input id="f-name" value="${c.name}"></div>
  <div class="field"><label>Teléfono</label><input id="f-phone" value="${c.phone||""}"></div>
  <div class="field"><label>Dirección principal</label><input id="f-addr" value="${c.address||""}"></div>
  <div class="field"><label>Segunda dirección (opcional)</label><input id="f-addr2" value="${c.address_2||""}"></div>
  <div class="field"><label>Notas</label><textarea id="f-notes" rows="2">${c.notes||""}</textarea></div>
  <div class="modal-actions"><button class="btn-ghost" id="cancel">Cancelar</button><button class="btn-primary" id="save">Guardar</button></div>`;
}

/* ---------- PROVEEDORES ---------- */
function proveedoresView(){
  const items = cache.providers.filter(p=>!state.search || p.name.toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="topbar"><h2>Proveedores</h2><button class="btn-primary" id="newProv">+ Nuevo proveedor</button></div>
  <div class="toolbar"><input id="pSearch" placeholder="Buscar proveedor..." value="${state.search}"></div>
  <div class="panel"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Contacto</th><th></th></tr></thead><tbody>
  ${items.map(p=>`<tr><td>${p.name}</td><td>${p.phone||"—"}</td><td>${p.contact||"—"}</td>
    <td style="text-align:right"><button class="btn-ghost btn-sm" data-edit-prov="${p.id}">Editar</button> <button class="btn-danger btn-sm" data-del-prov="${p.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No hay proveedores</td></tr>'}
  </tbody></table></div>`;
}
function providerFormHtml(p){
  p = p || {id:"",name:"",phone:"",contact:"",notes:""};
  return `<h3>${p.id?"Editar proveedor":"Nuevo proveedor"}</h3>
  <div class="field"><label>Nombre</label><input id="f-name" value="${p.name}"></div>
  <div class="row2"><div class="field"><label>Teléfono</label><input id="f-phone" value="${p.phone||""}"></div><div class="field"><label>Persona de contacto</label><input id="f-contact" value="${p.contact||""}"></div></div>
  <div class="field"><label>Notas</label><textarea id="f-notes" rows="2">${p.notes||""}</textarea></div>
  <div class="modal-actions"><button class="btn-ghost" id="cancel">Cancelar</button><button class="btn-primary" id="save">Guardar</button></div>`;
}

/* ---------- GASTOS ---------- */
const EXP_CATS = ["Ingredientes","Delivery","Servicios","Publicidad","Personal","Equipos","Mantenimiento","Empaques","Otros"];
function gastosView(){
  let items = cache.expenses.filter(e=>!state.search || e.description.toLowerCase().includes(state.search.toLowerCase()) || (e.providers?.name||"").toLowerCase().includes(state.search.toLowerCase()));
  const totalMes = cache.expenses.filter(e=>(e.expense_date||"").slice(0,7)===todayCaracas().slice(0,7)).reduce((s,e)=>s+Number(e.amount),0);
  return `<div class="topbar"><h2>Gastos</h2><button class="btn-primary" id="newExp">+ Nuevo gasto</button></div>
  <div class="cards" style="margin-bottom:16px"><div class="card"><div class="label">Gastos del mes</div><div class="val">${fmt$(totalMes)}</div></div></div>
  <div class="toolbar"><input id="pSearch" placeholder="Buscar por descripción o proveedor..." value="${state.search}"></div>
  <div class="panel"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Proveedor</th><th>Monto</th><th></th></tr></thead><tbody>
  ${items.map(e=>`<tr><td>${e.expense_date}</td><td>${e.category}</td><td>${e.description}</td><td>${e.providers?e.providers.name:"—"}</td><td>${fmt$(e.amount)}</td>
    <td style="text-align:right"><button class="btn-ghost btn-sm" data-edit-exp="${e.id}">Editar</button> <button class="btn-danger btn-sm" data-del-exp="${e.id}">Eliminar</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">No hay gastos registrados</td></tr>'}
  </tbody></table></div>`;
}
function expenseFormHtml(e){
  e = e || {id:"",expense_date:todayCaracas(),category:EXP_CATS[0],description:"",provider_id:"",amount:"",notes:""};
  return `<h3>${e.id?"Editar gasto":"Nuevo gasto"}</h3>
  <div class="row2">
    <div class="field"><label>Fecha</label><input id="f-date" type="date" value="${e.expense_date}"></div>
    <div class="field"><label>Categoría</label><select id="f-cat">${EXP_CATS.map(c=>`<option ${e.category===c?"selected":""}>${c}</option>`).join("")}</select></div>
  </div>
  <div class="field"><label>¿En qué se gastó?</label><input id="f-desc" value="${e.description}" placeholder="Ej: compra de pollo, gas, empaques..."></div>
  <div class="row2">
    <div class="field"><label>Proveedor (opcional)</label><select id="f-provider"><option value="">Ninguno</option>${cache.providers.map(p=>`<option value="${p.id}" ${e.provider_id===p.id?"selected":""}>${p.name}</option>`).join("")}</select></div>
    <div class="field"><label>Monto (USD)</label><input id="f-amount" type="number" step="0.01" value="${e.amount}"></div>
  </div>
  <div class="field"><label>Notas</label><textarea id="f-notes" rows="2">${e.notes||""}</textarea></div>
  <div class="modal-actions"><button class="btn-ghost" id="cancel">Cancelar</button><button class="btn-primary" id="save">Guardar</button></div>`;
}

/* ---------- ORDENES ---------- */
function statusLabel(s){ return {pendiente:"Pendiente",preparacion:"En preparación",lista:"Lista",delivery:"En delivery",completada:"Completada",cancelada:"Cancelada"}[s]||s; }
function ordenesView(){
  let items = cache.orders;
  if(state.filterStatus) items = items.filter(o=>o.status===state.filterStatus);
  if(state.search) items = items.filter(o=>(o.customers?.name||"").toLowerCase().includes(state.search.toLowerCase()) || (""+o.order_number).includes(state.search));
  return `<div class="topbar"><h2>Órdenes</h2><button class="btn-primary" id="newOrder">+ Nueva orden</button></div>
  <div class="toolbar">
    <input id="pSearch" placeholder="Buscar cliente o # orden..." value="${state.search}">
    <select id="fStatus"><option value="">Todos los estados</option>${["pendiente","preparacion","lista","delivery","completada","cancelada"].map(s=>`<option value="${s}" ${state.filterStatus===s?"selected":""}>${statusLabel(s)}</option>`).join("")}</select>
  </div>
  <div class="panel"><table><thead><tr><th>#</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Pago</th><th>Estado</th><th></th></tr></thead><tbody>
  ${items.map(o=>`<tr><td>${o.order_number}</td><td>${o.customers?o.customers.name:"—"}</td><td>${fmtDate(o.order_date)}</td><td>${fmt$(o.total)}</td><td>${o.payment_method||"—"}</td>
    <td><select data-status="${o.id}" style="width:auto;padding:4px 8px;font-size:12px">${["pendiente","preparacion","lista","delivery","completada","cancelada"].map(s=>`<option value="${s}" ${o.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}</select></td>
    <td style="text-align:right"><button class="btn-ghost btn-sm" data-ticket="${o.id}">Ticket</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty">No hay órdenes aún — crea la primera</td></tr>'}
  </tbody></table></div>`;
}

function orderBuilderHtml(){
  const products = cache.products.filter(p=>p.available);
  const customers = cache.customers;
  const zones = cache.zones.filter(z=>z.active!==false);
  const subtotal = state.orderCart.reduce((s,l)=>s+l.price*l.qty,0);
  const zone = zones.find(z=>z.id===state.orderZone) || {cost:0};
  const discount = state.orderDiscount||0;
  const total = subtotal + Number(zone.cost) - discount;
  return `<h3>Nueva orden</h3>
  <div class="ob-grid">
   <div>
    <div class="field"><label>Cliente</label>
      <select id="ob-cust"><option value="">Selecciona un cliente...</option>${customers.map(c=>`<option value="${c.id}" ${state.orderCustomer===c.id?"selected":""}>${c.name} — ${c.phone||""}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Productos</label>
      <div class="panel" style="max-height:220px;overflow-y:auto;padding:6px 12px">
      ${products.map(p=>`<div class="prod-pick"><span>${p.name} <span style="color:var(--dim)">· ${fmt$(p.price)}${p.stock!==null&&p.stock!==undefined?` · stock: ${p.stock}`:""}</span></span><button class="btn-ghost btn-sm" data-add="${p.id}">Agregar</button></div>`).join("") || '<div class="empty">No hay productos disponibles</div>'}
      </div>
    </div>
    <div class="row2">
      <div class="field"><label>Zona de delivery</label><select id="ob-zone"><option value="">Sin delivery</option>${zones.map(z=>`<option value="${z.id}" ${state.orderZone===z.id?"selected":""}>${z.name} — ${fmt$(z.cost)}</option>`).join("")}</select></div>
      <div class="field"><label>Método de pago</label><select id="ob-pay">${["Efectivo","Pago móvil","Transferencia","Zelle","Divisas","Otro"].map(m=>`<option>${m}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Descuento (USD, opcional)</label><input id="ob-disc" type="number" step="0.01" value="${discount||""}"></div>
    <div class="field"><label>Notas</label><textarea id="ob-notes" rows="2">${state.orderNotes||""}</textarea></div>
   </div>
   <div>
    <div class="panel" style="padding:14px">
      <div style="color:var(--dim);font-size:13px;margin-bottom:8px">Carrito</div>
      ${state.orderCart.map((l,i)=>`<div class="cart-line"><span>${l.name}</span><span class="qty-ctrl"><button data-qty="-${i}">−</button>${l.qty}<button data-qty="${i}">+</button> ${fmt$(l.price*l.qty)}</span></div>`).join("") || '<div style="color:var(--dim);font-size:13px">Agrega productos del panel izquierdo</div>'}
      <div style="margin-top:12px">
        <div class="summary-line"><span>Subtotal</span><span>${fmt$(subtotal)}</span></div>
        <div class="summary-line"><span>Delivery</span><span>${fmt$(zone.cost)}</span></div>
        <div class="summary-line"><span>Descuento</span><span>-${fmt$(discount)}</span></div>
        <div class="summary-line total"><span>Total</span><span>${fmt$(total)} <span style="color:var(--dim);font-weight:400;font-size:13px">/ ${fmtBs(total)}</span></span></div>
      </div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" id="cancel">Cancelar</button><button class="btn-primary" id="save-order">Guardar orden</button></div>
   </div>
  </div>`;
}

/* ---------- CONFIG ---------- */
function configView(){
  const c = cache.config;
  return `<div class="topbar"><h2>Configuración</h2></div>
  <div class="panel" style="padding:20px;margin-bottom:18px">
    <div style="color:var(--dim);font-size:14px;margin-bottom:12px">Restaurante</div>
    <div class="row2"><div class="field"><label>Nombre</label><input id="c-name" value="${c.name||""}"></div><div class="field"><label>Teléfono</label><input id="c-phone" value="${c.phone||""}"></div></div>
    <div class="field"><label>Dirección</label><input id="c-addr" value="${c.address||""}"></div>
  </div>
  <div class="panel" style="padding:20px;margin-bottom:18px">
    <div style="color:var(--dim);font-size:14px;margin-bottom:12px">Moneda</div>
    <div class="field" style="max-width:220px"><label>Tasa (1 USD = ? Bs)</label><input id="c-rate" type="number" step="0.01" value="${c.exchange_rate}"></div>
    <div style="font-size:12px;color:var(--dim)">Las órdenes ya creadas guardan su propia tasa y no cambian.</div>
  </div>
  <button class="btn-primary" id="saveConfig" style="margin-bottom:18px">Guardar configuración</button>
  <div class="panel" style="padding:20px">
    <div style="color:var(--dim);font-size:14px;margin-bottom:12px">Zonas de delivery</div>
    <div id="zonesList">${cache.zones.map(z=>`<div class="row2" style="margin-bottom:8px">
      <input data-zn="${z.id}" value="${z.name}">
      <div style="display:flex;gap:8px"><input data-zc="${z.id}" type="number" step="0.01" value="${z.cost}">
      <button class="btn-ghost btn-sm" data-save-zone="${z.id}">Guardar</button>
      <button class="btn-danger btn-sm" data-del-zone="${z.id}">Eliminar</button></div>
    </div>`).join("") || '<div class="empty">No hay zonas configuradas</div>'}</div>
    <button class="btn-ghost btn-sm" id="addZone">+ Agregar zona</button>
  </div>`;
}

/* ---------- MODALS ---------- */
function openModal(name){
  const wrap=document.createElement("div"); wrap.className="overlay"; wrap.id="overlay";
  const box=document.createElement("div"); box.className="modal";
  if(name==="prod") box.innerHTML = productFormHtml(state.editingProd);
  if(name==="cust") box.innerHTML = customerFormHtml(state.editingCust);
  if(name==="exp") box.innerHTML = expenseFormHtml(state.editingExp);
  if(name==="prov") box.innerHTML = providerFormHtml(state.editingProv);
  if(name==="order"){ box.style.maxWidth="820px"; box.innerHTML = orderBuilderHtml(); }
  wrap.appendChild(box); document.body.appendChild(wrap);
  wrap.onclick = e=>{ if(e.target===wrap){ closeModal(); } };
  wireModal(name);
}
function closeModal(){ state.modal=null; const o=document.getElementById("overlay"); if(o) o.remove(); }

function busySave(btn, fn){
  return async ()=>{
    btn.disabled=true; const old=btn.textContent; btn.textContent="Guardando...";
    try{ await fn(); }
    catch(e){
      btn.disabled=false; btn.textContent=old;
      if(e && e.message==="__validation") return; // el mensaje específico ya se mostró
      toast(friendlyError(e), true);
    }
  };
}

function wireModal(name){
  const cancel=document.getElementById("cancel"); if(cancel) cancel.onclick=closeModal;
  const saveBtn=document.getElementById("save");
  if(name==="prod"){
    saveBtn.onclick = busySave(saveBtn, async ()=>{
      const stockRaw=document.getElementById("f-stock").value;
      const val={name:document.getElementById("f-name").value.trim(), category:document.getElementById("f-cat").value.trim(), price:parseFloat(document.getElementById("f-price").value)||0, stock:stockRaw===""?null:parseInt(stockRaw)||0, available:document.getElementById("f-avail").checked};
      if(!val.name){ toast("El nombre es obligatorio", true); throw new Error("__validation"); }
      if(val.price<0){ toast("El precio no puede ser negativo", true); throw new Error("__validation"); }
      if(state.editingProd) await Api.update("products", state.editingProd.id, val); else await Api.insert("products", val);
      await loadProducts(); state.editingProd=null; closeModal(); render(); toast("Producto guardado");
    });
  }
  if(name==="cust"){
    saveBtn.onclick = busySave(saveBtn, async ()=>{
      const val={name:document.getElementById("f-name").value.trim(), phone:document.getElementById("f-phone").value.trim(), address:document.getElementById("f-addr").value.trim(), address_2:document.getElementById("f-addr2").value.trim(), notes:document.getElementById("f-notes").value.trim()};
      if(!val.name){ toast("El nombre es obligatorio", true); throw new Error("__validation"); }
      if(state.editingCust) await Api.update("customers", state.editingCust.id, val); else await Api.insert("customers", val);
      await loadCustomers(); state.editingCust=null; closeModal(); render(); toast("Cliente guardado");
    });
  }
  if(name==="prov"){
    saveBtn.onclick = busySave(saveBtn, async ()=>{
      const val={name:document.getElementById("f-name").value.trim(), phone:document.getElementById("f-phone").value.trim(), contact:document.getElementById("f-contact").value.trim(), notes:document.getElementById("f-notes").value.trim()};
      if(!val.name){ toast("El nombre es obligatorio", true); throw new Error("__validation"); }
      if(state.editingProv) await Api.update("providers", state.editingProv.id, val); else await Api.insert("providers", val);
      await loadProviders(); state.editingProv=null; closeModal(); render(); toast("Proveedor guardado");
    });
  }
  if(name==="exp"){
    saveBtn.onclick = busySave(saveBtn, async ()=>{
      const provId=document.getElementById("f-provider").value;
      const val={expense_date:document.getElementById("f-date").value||todayCaracas(), category:document.getElementById("f-cat").value, description:document.getElementById("f-desc").value.trim(), provider_id:provId||null, amount:parseFloat(document.getElementById("f-amount").value)||0, notes:document.getElementById("f-notes").value.trim()};
      if(!val.description){ toast("Describe en qué se gastó", true); throw new Error("__validation"); }
      if(val.amount<=0){ toast("El monto debe ser mayor a 0", true); throw new Error("__validation"); }
      if(state.editingExp) await Api.update("expenses", state.editingExp.id, val); else await Api.insert("expenses", val);
      await loadExpenses(); state.editingExp=null; closeModal(); render(); toast("Gasto guardado");
    });
  }
  if(name==="order"){
    document.getElementById("ob-cust").onchange=e=>{ state.orderCustomer=e.target.value; };
    document.getElementById("ob-zone").onchange=e=>{ state.orderZone=e.target.value; refreshOrderModal(); };
    document.getElementById("ob-disc").oninput=e=>{ state.orderDiscount=parseFloat(e.target.value)||0; };
    document.getElementById("ob-notes").oninput=e=>{ state.orderNotes=e.target.value; };
    document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{
      const p=cache.products.find(x=>x.id===b.dataset.add);
      const line=state.orderCart.find(l=>l.productId===p.id);
      if(line) line.qty++; else state.orderCart.push({productId:p.id,name:p.name,price:Number(p.price),qty:1});
      refreshOrderModal();
    });
    document.querySelectorAll("[data-qty]").forEach(b=>b.onclick=()=>{
      const idx=parseInt(b.dataset.qty); const i=Math.abs(idx);
      state.orderCart[i].qty += idx<0?-1:1;
      if(state.orderCart[i].qty<=0) state.orderCart.splice(i,1);
      refreshOrderModal();
    });
    document.getElementById("save-order").onclick=saveOrder;
  }
}
function refreshOrderModal(){ const box=document.querySelector(".modal"); box.innerHTML = orderBuilderHtml(); wireModal("order"); }

async function saveOrder(){
  const custId=document.getElementById("ob-cust").value;
  if(!custId){ toast("Selecciona un cliente", true); return; }
  if(state.orderCart.length===0){ toast("Agrega al menos un producto", true); return; }
  const btn=document.getElementById("save-order"); btn.disabled=true; btn.textContent="Guardando...";
  const zone=cache.zones.find(z=>z.id===state.orderZone);
  const payment=document.getElementById("ob-pay").value;
  const notes=document.getElementById("ob-notes").value;
  const discount=state.orderDiscount||0;
  try{
    const {data,error} = await sb.rpc("create_order",{
      p_customer_id:custId,
      p_items: state.orderCart.map(l=>({product_id:l.productId, quantity:l.qty})),
      p_delivery_zone_id: state.orderZone||null,
      p_discount: discount,
      p_payment_method: payment,
      p_notes: notes,
      p_exchange_rate: cache.config.exchange_rate
    });
    if(error) throw error;
    const created = Array.isArray(data)?data[0]:data;
    const cust=cache.customers.find(c=>c.id===custId);
    const subtotal=state.orderCart.reduce((s,l)=>s+l.price*l.qty,0);
    const ticketOrder = {
      number:created.order_number, date:fmtDate(new Date().toISOString()), time:fmtTime(new Date().toISOString()),
      customerName:cust?cust.name:"", customerPhone:cust?cust.phone:"", customerAddr:cust?cust.address:"",
      items:state.orderCart.slice(), subtotal, delivery: zone?Number(zone.cost):0, discount,
      total: subtotal+(zone?Number(zone.cost):0)-discount, payment, rate: cache.config.exchange_rate
    };
    await Promise.all([loadOrdersAndItems(), loadProducts()]);
    state.orderCart=[]; state.orderCustomer=null; state.orderZone=""; state.orderDiscount=0; state.orderNotes="";
    closeModal(); render();
    showTicketPreview(ticketOrder);
    toast("Orden creada");
  }catch(e){ toast(friendlyError(e), true); btn.disabled=false; btn.textContent="Guardar orden"; }
}

/* ---------- TICKET ---------- */
function ticketHtml(o){
  const c=cache.config;
  const bs=n=>Math.round(n*o.rate).toLocaleString("es-VE");
  return `<div class="c"><b>${c.name}</b><br>${c.phone||""}<br>${c.address||""}</div><hr>
    Orden #${o.number}<br>${o.date} ${o.time||""}<br>Cliente: ${o.customerName}<br>Tel: ${o.customerPhone||""}<br>${o.customerAddr?("Dir: "+o.customerAddr+"<br>"):""}<hr>
    ${o.items.map(l=>`<div class="row"><span>${l.qty}x ${l.name}</span><span>$${(l.price*l.qty).toFixed(2)}</span></div>`).join("")}<hr>
    <div class="row"><span>Subtotal</span><span>$${o.subtotal.toFixed(2)}</span></div>
    <div class="row"><span>Delivery</span><span>$${o.delivery.toFixed(2)}</span></div>
    <div class="row"><span>Descuento</span><span>-$${o.discount.toFixed(2)}</span></div>
    <div class="row"><b>TOTAL</b><b>$${o.total.toFixed(2)}</b></div>
    <div class="row"><span></span><span>Bs. ${bs(o.total)}</span></div><hr>
    Pago: ${o.payment}<br>Tasa: 1$ = ${o.rate} Bs<hr>
    <div class="c">¡Gracias por tu compra!</div>`;
}
function doPrint(o){ document.getElementById("ticket").innerHTML = ticketHtml(o); setTimeout(()=>window.print(),80); }
function showTicketPreview(o){
  const wrap=document.createElement("div"); wrap.className="overlay"; wrap.id="overlay";
  const box=document.createElement("div"); box.className="modal"; box.style.maxWidth="320px";
  box.innerHTML = `<h3>Ticket de la orden #${o.number}</h3>
    <div class="ticket-preview" style="background:#fff;color:#000;padding:12px;border-radius:6px;font-family:monospace;font-size:12px">${ticketHtml(o)}</div>
    <div class="modal-actions"><button class="btn-ghost" id="cancel">Cerrar</button><button class="btn-primary" id="doPrint">🖨️ Imprimir (58mm)</button></div>`;
  wrap.appendChild(box); document.body.appendChild(wrap);
  wrap.onclick=e=>{ if(e.target===wrap){ wrap.remove(); } };
  document.getElementById("cancel").onclick=()=>wrap.remove();
  document.getElementById("doPrint").onclick=()=>doPrint(o);
}
async function openTicketForOrder(o){
  try{
    const {data,error}=await sb.from("order_items").select("*").eq("order_id",o.id);
    if(error) throw error;
    const items = data.map(it=>({name:it.product_name, price:Number(it.price), qty:it.quantity}));
    showTicketPreview({ number:o.order_number, date:fmtDate(o.order_date), time:fmtTime(o.order_date),
      customerName:o.customers?o.customers.name:"", customerPhone:o.customers?o.customers.phone:"", customerAddr:o.customers?o.customers.address:"",
      items, subtotal:Number(o.subtotal), delivery:Number(o.delivery_cost), discount:Number(o.discount), payment:o.payment_method, rate:Number(o.exchange_rate) });
  }catch(e){ toast(friendlyError(e), true); }
}

/* ---------- EVENTOS GLOBALES ---------- */
document.addEventListener("click", async e=>{
  const t=e.target;
  if(t.id==="newProd"){ state.editingProd=null; state.modal="prod"; render(); }
  if(t.dataset.editProd){ state.editingProd=cache.products.find(p=>p.id===t.dataset.editProd); state.modal="prod"; render(); }
  if(t.dataset.delProd){ if(confirm("¿Eliminar este producto?")){ try{ await Api.remove("products", t.dataset.delProd); await loadProducts(); render(); }catch(e){ toast(friendlyError(e), true); } } }

  if(t.id==="newCust"){ state.editingCust=null; state.modal="cust"; render(); }
  if(t.dataset.editCust){ state.editingCust=cache.customers.find(c=>c.id===t.dataset.editCust); state.modal="cust"; render(); }
  if(t.dataset.delCust){ if(confirm("¿Eliminar este cliente?")){ try{ await Api.remove("customers", t.dataset.delCust); await loadCustomers(); render(); }catch(e){ toast(friendlyError(e), true); } } }

  if(t.id==="newProv"){ state.editingProv=null; state.modal="prov"; render(); }
  if(t.dataset.editProv){ state.editingProv=cache.providers.find(p=>p.id===t.dataset.editProv); state.modal="prov"; render(); }
  if(t.dataset.delProv){ if(confirm("¿Eliminar este proveedor?")){ try{ await Api.remove("providers", t.dataset.delProv); await loadProviders(); render(); }catch(e){ toast(friendlyError(e), true); } } }

  if(t.id==="newExp"){ state.editingExp=null; state.modal="exp"; render(); }
  if(t.dataset.editExp){ state.editingExp=cache.expenses.find(x=>x.id===t.dataset.editExp); state.modal="exp"; render(); }
  if(t.dataset.delExp){ if(confirm("¿Eliminar este gasto?")){ try{ await Api.remove("expenses", t.dataset.delExp); await loadExpenses(); render(); }catch(e){ toast(friendlyError(e), true); } } }

  if(t.id==="newOrder"){ state.orderCart=[]; state.orderCustomer=null; state.orderZone=""; state.orderDiscount=0; state.orderNotes=""; state.modal="order"; render(); }
  if(t.dataset.ticket){ const o=cache.orders.find(x=>x.id===t.dataset.ticket); if(o) openTicketForOrder(o); }

  if(t.id==="saveConfig"){
    const val={name:document.getElementById("c-name").value, phone:document.getElementById("c-phone").value, address:document.getElementById("c-addr").value, exchange_rate:parseFloat(document.getElementById("c-rate").value)||cache.config.exchange_rate};
    try{ await Api.update("config",1,val); await loadConfig(); render(); toast("Configuración guardada"); }catch(err){ toast(friendlyError(err), true); }
  }
  if(t.id==="addZone"){ try{ await Api.insert("delivery_zones",{name:"Nueva zona",cost:0,active:true}); await loadZones(); render(); }catch(err){ toast(friendlyError(err), true); } }
  if(t.dataset.saveZone){
    const id=t.dataset.saveZone;
    const name=document.querySelector(`[data-zn="${id}"]`).value;
    const cost=parseFloat(document.querySelector(`[data-zc="${id}"]`).value)||0;
    try{ await Api.update("delivery_zones", id, {name,cost}); await loadZones(); render(); toast("Zona guardada"); }catch(err){ toast(friendlyError(err), true); }
  }
  if(t.dataset.delZone){ if(confirm("¿Eliminar esta zona?")){ try{ await Api.remove("delivery_zones", t.dataset.delZone); await loadZones(); render(); }catch(err){ toast(friendlyError(err), true); } } }
});

document.addEventListener("change", async e=>{
  if(e.target.dataset.status){
    const id=e.target.dataset.status, val=e.target.value;
    e.target.disabled=true;
    try{ await Api.update("orders", id, {status:val}); await loadOrdersAndItems(); render(); toast("Estado actualizado"); }
    catch(err){ toast(friendlyError(err), true); }
  }
  if(e.target.id==="fStatus"){ state.filterStatus=e.target.value; render(); }
});
document.addEventListener("input", e=>{
  if(e.target.id==="pSearch"){
    state.search=e.target.value; const pos=e.target.selectionStart; render();
    const el=document.getElementById("pSearch"); if(el){ el.focus(); el.selectionStart=el.selectionEnd=pos; }
  }
});

/* ---------- ARRANQUE ---------- */
if(sb){
  render();
  sb.auth.onAuthStateChange((_event, session)=>{
    state.user = session ? session.user : null;
    if(state.user){
      if(state.route==="login" || state.route==="loading") state.route="dashboard";
      initApp();
    } else {
      state.route="login"; render();
    }
  });
} else {
  showFatalError();
}
