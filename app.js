// URL del Web App de Google Apps Script.
// Reemplaza por tu URL /exec después de desplegar el backend.
// (Este único valor de configuración de desarrollo se guarda en localStorage;
// todos los datos de la app —clientes, movimientos, notificaciones, etc.— usan IndexedDB vía localForage.)
const API_URL = 'https://script.google.com/macros/s/AKfycbyUaJozEq7fzJEOex5OL21uWeFXaEh5PKYDuIMUS1Vu0c37mQmPjSpAo9kHS56cqUK0/exec';

localforage.config({name:'envases_retornables', storeName:'envases_data'});
// Claves persistidas en IndexedDB (offline-first, ver sección 15 del prompt).
const DB_KEYS = ['user','clients','catalog','pending','history','notifications','reminders','config'];

const state = {
  user: null,
  clients: [],
  catalog: {tipos:[], alias:[]},
  pending: [],
  history: [],
  notifications: [],
  reminders: [],
  config: {},
  ui: { regClientId:null, retClientId:null, afterCreate:null, alertsFilter:'TODOS' }
};

async function loadLocalState(){
  try{
    const values = await Promise.all(DB_KEYS.map(k=>localforage.getItem('envases_'+k)));
    DB_KEYS.forEach((k,i)=>{ if(values[i]!=null) state[k]=values[i]; });
  }catch(e){ console.warn('No se pudo leer IndexedDB, se continúa en memoria.', e); }
}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const CHEVRON='<span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17"><path d="M9 6l6 6-6 6"/></svg></span>';
function emptyState(msg,icon){
  icon=icon||'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="30" height="30"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8 15c1 1.2 2.4 2 4 2s3-.8 4-2"/></svg>';
  return `<div class="empty-state">${icon}<p>${esc(msg)}</p></div>`;
}
function initials(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0]||'')+(parts[1]?.[0]||'')).toUpperCase()||'—';
}
async function saveState(){
  state.history = state.history.slice(0,50);
  try{
    await Promise.all(DB_KEYS.map(k=>localforage.setItem('envases_'+k, state[k])));
  }catch(e){ console.warn('No se pudo guardar en IndexedDB.', e); }
}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;$('#toastRoot').appendChild(d);setTimeout(()=>d.remove(),3000)}
function online(){return navigator.onLine}
function setConnection(){const b=$('#connectionBadge');if(!b)return;b.textContent=online()?'EN LÍNEA':'SIN CONEXIÓN';b.classList.toggle('offline',!online())}
async function api(fn,args={}){
  if(!API_URL) throw new Error('Configura API_URL en app.js para conectar Google Apps Script.');
  const url=API_URL+'?fn='+encodeURIComponent(fn)+'&data='+encodeURIComponent(JSON.stringify(args));
  const r=await fetch(url); const data=await r.json(); if(data.error) throw new Error(data.error); return data.result ?? data;
}
function nowLocal(){const off=new Date().getTimezoneOffset();return new Date(Date.now()-off*60000).toISOString().slice(0,16)}

/* ---------------- ROUTER ---------------- */
const VIEWS=['home','register','return','newclient','clients','dashboard','more','clientdetail','config','users','products','backup','reminder','reminders','alerts','recovery'];
function fmtDate(d){const dt=d?new Date(d):null;if(!dt||isNaN(dt.getTime()))return'—';const p=n=>String(n).padStart(2,'0');return`${p(dt.getDate())}/${p(dt.getMonth()+1)}/${dt.getFullYear()}`}
function boxCapacity_(product){const t=state.catalog?.tipos?.find(x=>String(x.nombre)===String(product));const n=Number(t?.unidades_por_caja||t?.capacidad_unidades||0);return Number.isFinite(n)&&n>0?n:null}
function debtUnits_(v){return Number(v?.UNIDAD||0)}
function debtUnitsInBoxes_(v){return Number(v?.UNIDAD_EN_CAJA||0)}
function debtLooseUnits_(v){return debtUnits_(v)}
function debtTotalEnvases_(v){return Number(v?.CAJA||0)+debtLooseUnits_(v)}
function debtHas_(v){return Number(v?.CAJA||0)>0||debtLooseUnits_(v)>0}
function debtDisplay_(product,v){
  const completas=Math.max(0,Number(v?.CAJA_COMPLETA||0));
  const parciales=Math.max(0,Number(v?.CAJA_PARCIAL||0));
  const dentro=Math.max(0,Number(v?.UNIDADES_EN_CAJAS_PARCIALES||0));
  const legacyDentro=Math.max(0,Number(v?.UNIDAD_EN_CAJA||0));
  const sueltas=Math.max(0,Number(v?.UNIDAD||0));
  const unidades=sueltas+dentro+legacyDentro;
  const cajasTotales=completas+parciales;
  const cap=boxCapacity_(product);
  return {
    cajas:cajasTotales,
    caja:parciales,
    completas,
    unidades,
    sueltas,
    dentro,
    legacyDentro,
    cap,
    partialText:parciales?`${parciales} ${parciales===1?'caja':'cajas'}${dentro?` · ${dentro} u. dentro`:''}`:'0',
    unitsText:unidades?`${unidades} ${unidades===1?'unidad':'unidades'}`:'0',
    completeText:completas?`${completas} ${completas===1?'caja':'cajas'}${cap?` · ${cap} u./caja`:''}`:'0'
  };
}
function debtSummaryText_(product,v){
  const d=debtDisplay_(product,v);
  const parts=[];
  if(d.caja)parts.push(`${d.caja} ${d.caja===1?'caja':'cajas'}${d.dentro?` (${d.dentro} u. dentro)`:''}`);
  if(d.completas)parts.push(`${d.completas} ${d.completas===1?'caja completa':'cajas completas'}${d.cap?` (${d.cap} u./caja)`:''}`);
  if(d.unidades)parts.push(`${d.unidades} ${d.unidades===1?'unidad':'unidades'} totales`);
  return parts.join(' · ')||'sin deuda';
}
function waLink(client){
  const digits=String(client.celular||'').replace(/\D/g,'');
  if(!digits)return null;
  const withCode=digits.length===9?('51'+digits):digits;
  const d=client.deuda||{};
  const lineas=Object.entries(d).filter(([,v])=>debtHas_(v))
    .map(([p,v])=>`${p}: ${debtSummaryText_(p,v)}`);
  const msg=`Hola ${client.nombre}.\n\nTenemos registrados envases retornables pendientes de devolución:\n\n${lineas.join('\n')}\n\nCuando puedas, por favor coordina la devolución.\n\nGracias.`;
  return`https://wa.me/${withCode}?text=${encodeURIComponent(msg)}`;
}
function navigate(view,param){location.hash=view+(param?(':'+param):'')}
function parseHash(){const h=(location.hash||'').replace('#','');if(!h)return{view:'home',param:null};const[view,param]=h.split(':');return{view:VIEWS.includes(view)?view:'home',param:param||null}}
function route(){
  if(!state.user)return;
  const {view,param}=parseHash();
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  const target=$('#view-'+view);(target||$('#view-home')).classList.remove('hidden');
  $('#backBtn').classList.toggle('hidden',!state.user || view==='home');
  document.querySelectorAll('.bottom-nav [data-nav]').forEach(b=>b.classList.toggle('nav-active',b.dataset.nav===view));
  if(view==='home'){renderHistory();updateStats()}
  else if(view==='register')showRegisterView(param);
  else if(view==='return')showReturnView(param);
  else if(view==='newclient')showNewClientView();
  else if(view==='clients')showClientsView();
  else if(view==='dashboard')showDashboardView();
  else if(view==='more')showMoreView();
  else if(view==='clientdetail')showClientDetail(param);
  else if(view==='config')showConfigView();
  else if(view==='users')showUsersView();
  else if(view==='products')showProductsView();
  else if(view==='backup')showBackupView();
  else if(view==='reminder')showReminderView(param);
  else if(view==='reminders')showRemindersView();
  else if(view==='alerts')showAlertsView();
  else if(view==='recovery')showRecoveryView();
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);
$('#backBtn').onclick=()=>history.back();
document.body.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b){navigate(b.dataset.nav)}});

function render(){
  const logged=!!state.user;
  $('#loginView').classList.toggle('hidden',logged);
  $('#mainView').classList.toggle('hidden',!logged);
  $('#bottomNav').classList.toggle('hidden',!logged);
  // La campana y la flecha pertenecen exclusivamente a la aplicación autenticada.
  // Esto evita que queden visibles en el login al volver desde otra pantalla.
  $('#notifBtn').classList.toggle('hidden',!logged);
  $('#backBtn').classList.toggle('hidden',!logged || parseHash().view==='home');
  if(!logged)return;
  $('#helloName').textContent=state.user.nombre;
  setConnection();
  refreshLocalCrateAlerts();
  route();
}
function renderHistory(){
  const box=$('#localHistory');if(!box)return;
  if(!state.history.length){box.innerHTML=emptyState('Aún no hay movimientos locales.');return}
  box.innerHTML=state.history.slice(0,8).map(m=>`<div class="item"><div><b>${esc(m.tipo_caja)}</b> · ${m.tipo_envase==='CAJA'?(Number(m.contenido_unidades||0)>0?`CAJA · ${m.contenido_unidades} U. DENTRO`:'CAJA COMPLETA'):(m.ubicacion_unidad==='EN_CAJA'?'UNIDAD · DENTRO DE CAJA':'UNIDAD')}<small>${esc(m.tipo_movimiento)} · ${esc(m.cliente_nombre||m.cliente_id)}</small></div><span class="tag ${m.tipo_movimiento==='DEVOLUCION'?'success':'warn'}">${m.cantidad}</span></div>`).join('');
}
function pendingNotifs(){return state.notifications.filter(n=>String(n.estado)==='PENDIENTE')}
function updateStats(){
  const all=state.clients.map(c=>c.deuda||{}); const crates=all.reduce((s,d)=>s+Object.values(d).reduce((a,x)=>a+debtTotalEnvases_(x),0),0);
  const statCrates=$('#statCrates'); if(!statCrates)return;
  statCrates.textContent=crates;
  $('#statClients').textContent=all.filter(d=>Object.values(d).some(x=>debtHas_(x))).length;
  const pend=pendingNotifs();
  $('#statAlerts').textContent=pend.filter(n=>n.prioridad==='ALTA').length;
  $('#statReminders').textContent=pend.filter(n=>n.tipo==='EVENTO_PROXIMO'||n.tipo==='EVENTO_HOY').length;
  $('#notifCount').textContent=pend.length;
}

function totalPendingBoxes_(client){
  return Object.values(client?.deuda||{}).reduce((sum,v)=>sum+Number(v?.CAJA||0),0);
}

// Genera la alerta de muchas cajas también en modo offline. En línea, el backend
// sigue siendo la fuente de verdad; esta capa garantiza que la alerta sea visible
// inmediatamente cuando el movimiento se registra en el dispositivo.
function refreshLocalCrateAlerts(){
  const min=Math.max(1,Number(state.config?.cantidad_cajas_alerta||10));
  const now=new Date().toISOString();
  let changed=false;
  state.clients.forEach(client=>{
    const total=totalPendingBoxes_(client);
    const existing=state.notifications.filter(n=>n.tipo==='MUCHAS_CAJAS'&&String(n.cliente_id)===String(client.id));
    const pending=existing.find(n=>String(n.estado)==='PENDIENTE');
    const latest=existing.slice().sort((a,b)=>new Date(b.fecha_generacion||0)-new Date(a.fecha_generacion||0))[0];

    if(total>=min){
      // Si nunca hubo una alerta local para este cliente, créala.
      // Si hubo una alerta local que quedó resuelta porque bajó del umbral,
      // se permite una nueva alerta al volver a alcanzarlo.
      const canCreate=!pending && (!latest || latest._localResolved===true);
      if(canCreate){
        state.notifications.unshift({
          id:'LOCAL_NOT_'+Date.now()+'_'+String(client.id),
          tipo:'MUCHAS_CAJAS', prioridad:'ALTA', cliente_id:client.id,
          recordatorio_id:'', titulo:'Muchas cajas pendientes',
          mensaje:`${client.nombre} tiene ${total} cajas pendientes.`,
          fecha_generacion:now, fecha_evento:now, estado:'PENDIENTE',
          fecha_atendida:'', atendida_por:'', _local:true, _localResolved:false
        });
        changed=true;
        toast(`Alerta: ${client.nombre} llegó a ${total} cajas pendientes.`);
      }
    }else if(latest && latest._local){
      // Marcar el ciclo como resuelto incluso si el usuario ya la había
      // atendido manualmente; así una nueva subida al umbral vuelve a alertar.
      if(!latest._localResolved || pending){
        if(pending){
          pending.estado='ATENDIDA';
          pending.fecha_atendida=now;
          pending.atendida_por='Sistema (umbral resuelto)';
        }
        latest._localResolved=true;
        changed=true;
      }
    }
  });
  if(changed){
    saveState();
    updateStats();
  }
}

async function loadData(){
  if(!online()||!API_URL){ refreshLocalCrateAlerts(); return; }
  try{
    state.clients=await api('getClientes');
    state.catalog=await api('getCatalogo');
    state.config=await api('getConfiguracion');
    await api('generarNotificaciones');
    state.notifications=await api('getNotificaciones',{incluirAtendidas:true});
    state.reminders=await api('getRecordatorios');
    refreshLocalCrateAlerts();
    saveState(); render();
  }catch(e){toast('No se pudo sincronizar: '+e.message)}
}

function openLogoutConfirm(){
  const modal=$('#logoutModal');
  if(!modal)return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(()=>$('#logoutCancel')?.focus(),0);
}
function closeLogoutConfirm(){
  $('#logoutModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
function confirmLogout(){
  closeLogoutConfirm();
  state.user=null;
  saveState();
  location.hash='';
  render();
  toast('Sesión cerrada.');
}

async function login(e){
  e.preventDefault();
  const usuario=$('#loginUser').value.trim(), pin=$('#loginPin').value.trim();
  try{
    if(online()&&API_URL) state.user=(await api('login',{usuario,pin})).usuario;
    else {
      const demos={Admin:{pin:'0000',rol:'admin'},Carlos:{pin:'1111',rol:'cajero'},Ana:{pin:'2222',rol:'cajero'}};
      if(!demos[usuario]||demos[usuario].pin!==pin) throw new Error('Usuario o PIN incorrecto en modo offline.');
      state.user={id:'offline',nombre:usuario,rol:demos[usuario].rol};
    }
    saveState(); location.hash=''; render(); await loadData(); toast('Bienvenido, '+state.user.nombre);
  }catch(err){toast(err.message)}
}
$('#loginForm').addEventListener('submit',login);
$('#logoutBtn').onclick=()=>openLogoutConfirm();
$('#logoutCancel').onclick=closeLogoutConfirm;
$('#logoutConfirm').onclick=confirmLogout;
$('#logoutModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLogoutConfirm()});
$('#userCancel')?.addEventListener('click',closeUserModal);
$('#userForm')?.addEventListener('submit',saveUserEdit_);
$('#userModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeUserModal()});
$('#productCancel')?.addEventListener('click',closeProductModal);
$('#productForm')?.addEventListener('submit',saveProductEdit_);
$('#productModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeProductModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#logoutModal').classList.contains('hidden'))closeLogoutConfirm()});
$('#notifBtn').onclick=()=>navigate('alerts');

/* ---------------- MODAL GENÉRICO DE CONFIRMACIÓN (usado por mantenimiento) ---------------- */
function askConfirm(title,text,okLabel){
  return new Promise(resolve=>{
    const modal=$('#confirmModal');
    if(!modal)return resolve(true);
    $('#confirmTitle').textContent=title;
    $('#confirmText').textContent=text;
    const okBtn=$('#confirmOkBtn'), cancelBtn=$('#confirmCancelBtn');
    okBtn.textContent=okLabel||'Confirmar';
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    const close=result=>{modal.classList.add('hidden');document.body.classList.remove('modal-open');okBtn.onclick=null;cancelBtn.onclick=null;resolve(result)};
    okBtn.onclick=()=>close(true);
    cancelBtn.onclick=()=>close(false);
  });
}
$('#confirmModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)$('#confirmCancelBtn')?.click()});

/* ---------------- CLIENT PICKER (usado en register / return) ---------------- */
function clientCardHTML(client,mode){
  return `<div style="display:flex;align-items:center;gap:12px;min-width:0"><div class="avatar">${esc(initials(client.nombre))}</div><div style="min-width:0"><b>${esc(client.nombre)}</b><small>${esc(client.celular||'Sin celular')}${client.dni?(' · '+esc(client.dni)):''}</small></div></div><button type="button" data-change="${mode}">Cambiar</button>`;
}
function renderClientPicker(root,mode){
  root.innerHTML=`<label class="search-field"><input id="pickerSearch" placeholder="Buscar por nombre, DNI o celular"></label><div id="pickerList" class="list"></div><button type="button" class="add-row-btn" id="pickerNewClient"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg>Crear cliente nuevo</button>`;
  const draw=()=>{
    const q=$('#pickerSearch').value.toLowerCase();
    const list=state.clients.filter(c=>(c.nombre+' '+(c.dni||'')+' '+(c.celular||'')).toLowerCase().includes(q));
    $('#pickerList').innerHTML=list.length?list.map(c=>`<button type="button" class="item client-pick" data-id="${esc(c.id)}"><div><b>${esc(c.nombre)}</b><small>${esc(c.celular||'Sin celular')}</small></div>${CHEVRON}</button>`).join(''):emptyState('No se encontraron clientes con ese criterio.');
    $('#pickerList').querySelectorAll('.client-pick').forEach(b=>b.onclick=()=>navigate(mode,b.dataset.id));
  };
  $('#pickerSearch').oninput=draw;
  $('#pickerNewClient').onclick=()=>{state.ui.afterCreate=mode;navigate('newclient')};
  draw();
}

/* ---------------- REGISTRAR ENVASES ---------------- */
function showRegisterView(clientId){
  const picker=$('#regClientPicker'), form=$('#regForm'), footer=$('#regFooter');
  if(!clientId){
    form.classList.add('hidden'); footer.classList.add('hidden'); picker.classList.remove('hidden');
    renderClientPicker(picker,'register');
    return;
  }
  const client=state.clients.find(c=>String(c.id)===String(clientId));
  if(!client){toast('Cliente no encontrado.');navigate('register');return}
  picker.classList.add('hidden'); form.classList.remove('hidden'); footer.classList.remove('hidden');
  state.ui.regClientId=clientId;
  $('#regClientCard').innerHTML=clientCardHTML(client,'register');
  $('#regClientCard').querySelector('[data-change]').onclick=()=>navigate('register');
  $('#regDate').value=nowLocal();
  $('#regTicket').value=''; $('#regNotes').value='';
  $('#ocrArea').innerHTML=''; $('#ocrArea').classList.add('hidden');
  $('#regRows').innerHTML='';
  addRegRow();
  updateRegSummary();
  $('#regOcrBtn').onclick=()=>startOCR();
  $('#regAddRow').onclick=()=>{addRegRow();updateRegSummary()};
  $('#regCancel').onclick=()=>navigate('clientdetail',clientId);
  $('#regConfirm').onclick=()=>confirmRegister(clientId);
}
function addRegRow(data={}){
  const box=$('#regRows');if(!box)return;
  const id='r_'+Date.now()+Math.random();
  const products=state.catalog.tipos.map(t=>`<option>${esc(t.nombre)}</option>`).join('')||'<option>Pilsen</option><option>Cusqueña</option><option>Inca Kola 1L</option>';
  const initialPres=data.presentacion||'CAJA';
  const initialBox=(data.incluye_caja!=null?!!data.incluye_caja:(initialPres==='UNIDAD'));
  box.insertAdjacentHTML('beforeend',`<div class="check-row" data-row="${id}"><div class="row-grid"><select class="prod">${products}</select><div class="qty-stepper"><button type="button" class="qty-dec" aria-label="Restar">−</button><input class="qty" type="number" inputmode="numeric" min="1" value="${data.cantidad||1}"><button type="button" class="qty-inc" aria-label="Sumar">+</button></div><select class="pres"><option>CAJA</option><option>UNIDAD</option></select><button type="button" class="row-remove" aria-label="Quitar">×</button></div><label class="box-option"><input type="checkbox" class="incluyeCaja" ${initialBox?'checked':''}> <span>Las unidades van dentro de una caja retornable</span></label><small class="box-capacity-hint"></small></div>`);
  const row=box.lastElementChild;
  if(data.producto)row.querySelector('.prod').value=data.producto;
  row.querySelector('.pres').value=initialPres;
  const qty=row.querySelector('.qty');
  const boxChk=row.querySelector('.incluyeCaja');
  const syncBoxOption=()=>{
    const isUnidad=row.querySelector('.pres').value==='UNIDAD';
    const product=row.querySelector('.prod').value;
    const cap=boxCapacity_(product);
    const hint=row.querySelector('.box-capacity-hint');
    if(hint) hint.textContent=isUnidad ? (boxChk.checked ? `Se registrará 1 caja con ${Number(qty.value)||0} unidad(es) dentro. No se suman como unidades sueltas.` : 'Las unidades se registrarán como unidades sueltas.') : (cap ? `Caja completa: ${cap} unidades dentro. Si no está completa, usa UNIDAD + la opción de caja.` : 'Caja completa: se registra como 1 caja retornable.');
    boxChk.closest('.box-option').classList.toggle('hidden',!isUnidad);
    if(!isUnidad)boxChk.checked=false;
    else if(boxChk.dataset.touched!=='1' && boxChk.dataset.defaulted!=='1'){boxChk.checked=true;boxChk.dataset.defaulted='1'}
    updateRegSummary();
  };
  row.querySelectorAll('input,select').forEach(el=>el.oninput=()=>{updateRegSummary();if(el.classList.contains('prod')||el.classList.contains('qty')||el.classList.contains('incluyeCaja'))syncBoxOption()});
  row.querySelector('.pres').onchange=syncBoxOption;
  boxChk.onchange=()=>{boxChk.dataset.touched='1';updateRegSummary()};
  syncBoxOption();
  row.querySelector('.qty-dec').onclick=()=>{qty.value=Math.max(1,(Number(qty.value)||1)-1);updateRegSummary()};
  row.querySelector('.qty-inc').onclick=()=>{qty.value=(Number(qty.value)||0)+1;updateRegSummary()};
  row.querySelector('.row-remove').onclick=()=>{if(box.children.length>1){row.remove();updateRegSummary()}else toast('Debe quedar al menos un producto.')};
}
function updateRegSummary(){
  const rows=[...document.querySelectorAll('#regRows .check-row')].map(r=>({q:Number(r.querySelector('.qty').value)||0,p:r.querySelector('.pres').value,box:r.querySelector('.incluyeCaja')?.checked})).filter(x=>x.q>0);
  const el=$('#regSummary');if(!el)return;
  const unidadesSueltas=rows.filter(x=>x.p==='UNIDAD'&&!x.box).reduce((a,x)=>a+x.q,0);
  const cajasCompletas=rows.filter(x=>x.p==='CAJA').reduce((a,x)=>a+x.q,0);
  const cajasParciales=rows.filter(x=>x.p==='UNIDAD'&&x.box).length;
  const unidadesEnCajas=rows.filter(x=>x.p==='UNIDAD'&&x.box).reduce((a,x)=>a+x.q,0);
  const cajas=cajasCompletas+cajasParciales;
  const detalle=[]; if(cajasCompletas)detalle.push(`${cajasCompletas} completa${cajasCompletas===1?'':'s'}`); if(cajasParciales)detalle.push(`${cajasParciales} con ${unidadesEnCajas} u.`);
  el.innerHTML=rows.length?`<b>${rows.length}</b> producto(s) · <b>${cajas}</b> caja(s)${detalle.length?` · ${detalle.join(' + ')}`:''}${unidadesSueltas?` · <b>${unidadesSueltas}</b> u. sueltas`:''}`:'Agrega al menos un producto con cantidad mayor a cero.';
  $('#regConfirm').disabled=!rows.length;
}
async function confirmRegister(clientId){
  const rows=[...document.querySelectorAll('#regRows .check-row')].map(r=>{const box=r.querySelector('.incluyeCaja')?.checked===true;const pres=r.querySelector('.pres').value;const qty=Number(r.querySelector('.qty').value)||0;return {tipo_caja:r.querySelector('.prod').value,tipo_envase:(pres==='UNIDAD'&&box)?'CAJA':pres,cantidad:(pres==='UNIDAD'&&box)?1:qty,incluye_caja:false,contenido_unidades:(pres==='UNIDAD'&&box)?qty:0};}).filter(x=>x.cantidad>0);
  if(!rows.length)return toast('Agrega al menos un producto.');
  const btn=$('#regConfirm');if(btn.disabled)return;btn.disabled=true;
  try{
    await saveMovements(clientId,rows,'REGISTRO');
    toast(online()&&API_URL?'Registro guardado.':'Guardado offline. Se sincronizará cuando haya conexión.');
    navigate('clientdetail',clientId);
  }finally{btn.disabled=false}
}
async function startOCR(){
  const area=$('#ocrArea');area.classList.remove('hidden');
  area.innerHTML=`<label>Foto del ticket<input id="receiptFile" type="file" accept="image/*" capture="environment"></label><div id="ocrStatus"></div><div id="ocrText"></div>`;
  $('#receiptFile').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    $('#ocrStatus').textContent='Leyendo ticket localmente…';
    try{
      const result=await Tesseract.recognize(file,'spa+eng',{logger:m=>{if(m.status==='recognizing text')$('#ocrStatus').textContent='OCR '+Math.round((m.progress||0)*100)+'%'}});
      const text=result.data.text; $('#ocrText').innerHTML=`<div class="ocr-result">${esc(text)}</div>`;
      const detected=detectProducts(text);
      $('#ocrText').insertAdjacentHTML('beforeend',`<p><b>Revisión obligatoria</b>: verifica/corrige las cantidades antes de guardar.</p>`);
      detected.forEach(d=>addRegRow(d));
      updateRegSummary();
    }catch(err){$('#ocrStatus').textContent='No se pudo leer la imagen. Puedes registrar manualmente.'}
  }
}
function detectProducts(text){
  const lines=text.toUpperCase().split(/\n+/).map(x=>x.trim()).filter(Boolean), out=[];
  for(const line of lines){
    let product=null;for(const t of state.catalog.tipos){const aliases=state.catalog.alias.filter(a=>String(a.tipo_caja_id)===String(t.id)).map(a=>String(a.alias).toUpperCase());if(aliases.some(a=>line.includes(a))||line.includes(String(t.nombre).toUpperCase())){product=t.nombre;break}}
    if(!product)continue;
    const nums=line.match(/\d+/g);const qty=nums?Number(nums[nums.length-1]):1;
    const pres=/\b(CJ|CAJA|CAJAS)\b/.test(line)?'CAJA':/\b(UND|UNIDAD|UNIDADES)\b/.test(line)?'UNIDAD':null;
    if(pres)out.push({producto:product,presentacion:pres,cantidad:qty});
  }
  return out;
}

/* ---------------- REGISTRAR DEVOLUCIÓN ---------------- */
function showReturnView(clientId){
  const picker=$('#retClientPicker'), form=$('#retForm'), footer=$('#retFooter');
  if(!clientId){
    form.classList.add('hidden'); footer.classList.add('hidden'); picker.classList.remove('hidden');
    renderClientPicker(picker,'return');
    return;
  }
  const client=state.clients.find(c=>String(c.id)===String(clientId));
  if(!client){toast('Cliente no encontrado.');navigate('return');return}
  const d=client.deuda||{};
  const entries=[];
  Object.entries(d).forEach(([prod,v])=>{
    const completas=Number(v.CAJA_COMPLETA||0), parciales=Number(v.CAJA_PARCIAL||0), dentro=Number(v.UNIDADES_EN_CAJAS_PARCIALES||0);
    if(completas)entries.push({prod,pres:'CAJA_COMPLETA',max:completas,label:`Caja completa${boxCapacity_(prod)?` (${boxCapacity_(prod)} u.)`:''}`});
    if(parciales)entries.push({prod,pres:'CAJA_PARCIAL',max:parciales,label:`Caja parcial · ${dentro} u. dentro`});
    if(!completas&&!parciales&&Number(v.CAJA||0)>0)entries.push({prod,pres:'CAJA_COMPLETA',max:Number(v.CAJA),label:`Caja completa${boxCapacity_(prod)?` (${boxCapacity_(prod)} u.)`:''}`});
    if(Number(v.UNIDAD||0)>0)entries.push({prod,pres:'UNIDAD',max:Number(v.UNIDAD),label:'Unidades sueltas'});
  });
  if(!entries.length){toast('Este cliente no tiene envases pendientes.');navigate('clientdetail',clientId);return}
  picker.classList.add('hidden'); form.classList.remove('hidden'); footer.classList.remove('hidden');
  state.ui.retClientId=clientId;
  $('#retClientCard').innerHTML=clientCardHTML(client,'return');
  $('#retClientCard').querySelector('[data-change]').onclick=()=>navigate('return');
  $('#retDate').value=nowLocal(); $('#retNotes').value='';
  $('#retRows').innerHTML=entries.map((x,i)=>`<div class="pending-row" data-prod="${esc(x.prod)}" data-pres="${x.pres}" data-max="${x.max}">
      <div class="meta"><b>${esc(x.prod)}</b><small>${esc(x.label)} · pendiente: ${x.max}</small>${x.pres==='CAJA_PARCIAL'?`<label class="inline-mini">U. por caja devuelta<input type="number" class="retContent" min="1" step="1" placeholder="Ej. 6" disabled></label>`:''}</div>
      <div class="qty-wrap"><input type="checkbox" class="retChk"><div class="qty-stepper small"><button type="button" class="qty-dec" disabled>−</button><input type="number" class="retQty" inputmode="numeric" min="1" max="${x.max}" value="${x.max}" disabled><button type="button" class="qty-inc" disabled>+</button></div></div>
    </div>`).join('');
  $('#retRows').querySelectorAll('.pending-row').forEach(row=>{
    const chk=row.querySelector('.retChk'), qty=row.querySelector('.retQty'), dec=row.querySelector('.qty-dec'), inc=row.querySelector('.qty-inc'), max=Number(row.dataset.max);
    const content=row.querySelector('.retContent'); chk.onchange=()=>{const on=chk.checked;qty.disabled=!on;dec.disabled=!on;inc.disabled=!on;if(content)content.disabled=!on;updateRetSummary()};
    qty.oninput=updateRetSummary;
    dec.onclick=()=>{qty.value=Math.max(1,(Number(qty.value)||1)-1);updateRetSummary()};
    inc.onclick=()=>{qty.value=Math.min(max,(Number(qty.value)||0)+1);updateRetSummary()};
  });
  updateRetSummary();
  $('#retCancel').onclick=()=>navigate('clientdetail',clientId);
  $('#retConfirm').onclick=()=>confirmReturn(clientId);
}
function updateRetSummary(){
  const rows=[...document.querySelectorAll('#retRows .pending-row')].filter(r=>r.querySelector('.retChk').checked);
  const el=$('#retSummary');if(!el)return;
  el.innerHTML=rows.length?`<b>${rows.length}</b> producto(s) seleccionado(s) para devolver`:'Marca los productos que el cliente está devolviendo.';
  $('#retConfirm').disabled=!rows.length;
}
async function confirmReturn(clientId){
  const rows=[...document.querySelectorAll('#retRows .pending-row')].filter(r=>r.querySelector('.retChk').checked).map(r=>{
    const max=Number(r.dataset.max), qty=Number(r.querySelector('.retQty').value);
    const pres=r.dataset.pres; const content=Number(r.querySelector('.retContent')?.value||0);
    return {tipo_caja:r.dataset.prod,tipo_envase:pres==='UNIDAD'?'UNIDAD':'CAJA',cantidad:qty,max,ubicacion_unidad:'SUELTA',contenido_unidades:pres==='CAJA_PARCIAL'?content:0,caja_clase:pres};
  });
  if(!rows.length)return toast('Selecciona al menos un producto a devolver.');
  for(const x of rows){if(x.cantidad<=0||x.cantidad>x.max)return toast('La cantidad de "'+x.tipo_caja+'" supera la deuda pendiente.');if(x.caja_clase==='CAJA_PARCIAL'&&(!Number.isInteger(x.contenido_unidades)||x.contenido_unidades<=0))return toast('Indica cuántas unidades contiene cada caja parcial devuelta.');}
  const btn=$('#retConfirm');if(btn.disabled)return;btn.disabled=true;
  try{
    await saveMovements(clientId,rows,'DEVOLUCION');
    toast(online()&&API_URL?'Devolución registrada.':'Guardado offline. Se sincronizará cuando haya conexión.');
    navigate('clientdetail',clientId);
  }finally{btn.disabled=false}
}

/* ---------------- Lógica compartida de movimientos ---------------- */
async function saveMovements(clientId,rows,type){
  const client=state.clients.find(c=>String(c.id)===String(clientId));
  for(const x of rows){
    const m={cliente_id:clientId,cajero_nombre:state.user.nombre,tipo_movimiento:type,tipo_caja:x.tipo_caja,tipo_envase:x.tipo_envase,cantidad:x.cantidad,contenido_unidades:Number(x.contenido_unidades||0),caja_clase:x.caja_clase||'',incluye_caja:!!x.incluye_caja,ubicacion_unidad:x.ubicacion_unidad||(x.tipo_envase==='UNIDAD'&&x.incluye_caja?'EN_CAJA':'SUELTA'),id_offline_temp:'OFF_'+crypto.randomUUID()};
    if(online()&&API_URL){
      try{
        const res=await api('registrarMovimiento',m);
        if(res.movimientos?.length){
          res.movimientos.forEach(mm=>{const local={...mm,cliente_nombre:client?.nombre};state.history.unshift(local)});
        }else{
          applyDebt(client,x,type); state.history.unshift({...m,id:res.id||m.id_offline_temp,cliente_nombre:client?.nombre});
        }
        client.deuda=res.deuda||client.deuda;
      }catch(e){toast(e.message);continue}
    } else {
      // Offline: la caja que acompaña a las unidades se guarda como un movimiento independiente.
      state.pending.push(m);applyDebt(client,x,type);state.history.unshift({...m,cliente_nombre:client?.nombre});
      if(type==='REGISTRO' && x.tipo_envase==='UNIDAD' && x.incluye_caja){
        const caja={...m,tipo_envase:'CAJA',cantidad:1,id_offline_temp:m.id_offline_temp+'_CAJA'};
        state.pending.push(caja);applyDebt(client,caja,type);state.history.unshift({...caja,cliente_nombre:client?.nombre});
      }
    }
  }
  refreshLocalCrateAlerts();
  saveState(); render(); syncPending();
}
function applyDebt(client,x,type){
  client.deuda=client.deuda||{};
  const cur=client.deuda[x.tipo_caja]||{CAJA:0,CAJA_COMPLETA:0,CAJA_PARCIAL:0,UNIDADES_EN_CAJAS_PARCIALES:0,UNIDAD:0,UNIDAD_EN_CAJA:0};
  const sign=type==='DEVOLUCION'?-1:1;
  if(x.tipo_envase==='CAJA'){
    const partial=Number(x.contenido_unidades||0)>0 || x.caja_clase==='CAJA_PARCIAL';
    cur.CAJA=(Number(cur.CAJA)||0)+sign*Number(x.cantidad||0);
    if(partial){cur.CAJA_PARCIAL=(Number(cur.CAJA_PARCIAL)||0)+sign*Number(x.cantidad||0);cur.UNIDADES_EN_CAJAS_PARCIALES=(Number(cur.UNIDADES_EN_CAJAS_PARCIALES)||0)+sign*(Number(x.contenido_unidades||0));}
    else cur.CAJA_COMPLETA=(Number(cur.CAJA_COMPLETA)||0)+sign*Number(x.cantidad||0);
  }else if(x.tipo_envase==='UNIDAD'&&x.ubicacion_unidad==='EN_CAJA'){
    // Compatibilidad con datos de versiones anteriores.
    cur.UNIDAD_EN_CAJA=(Number(cur.UNIDAD_EN_CAJA)||0)+sign*Number(x.cantidad||0);
  }else{cur.UNIDAD=(Number(cur.UNIDAD)||0)+sign*Number(x.cantidad||0);}
  Object.keys(cur).forEach(k=>{cur[k]=Math.max(0,Number(cur[k]||0))});
  if(cur.CAJA===0&&cur.UNIDAD===0&&cur.UNIDAD_EN_CAJA===0){delete client.deuda[x.tipo_caja];}else{client.deuda[x.tipo_caja]=cur;}
}

/* ---------------- NUEVO CLIENTE ---------------- */
function showNewClientView(){
  $('#ncName').value='';$('#ncPhone').value='';$('#ncDni').value='';$('#ncAddress').value='';
  const form=$('#ncForm');
  form.onsubmit=async e=>{
    e.preventDefault();
    const data={nombre:$('#ncName').value,celular:$('#ncPhone').value,dni:$('#ncDni').value,direccion:$('#ncAddress').value,creado_por:state.user?.nombre};
    if(!data.nombre.trim())return toast('El nombre es obligatorio.');
    let id='OFF_'+Date.now();
    if(online()&&API_URL){try{const r=await api('saveClient',data);id=r.id||id}catch(e){return toast(e.message)}}
    const c={id,...data,deuda:{}};state.clients.push(c);saveState();
    toast('Cliente creado.');
    const dest=state.ui.afterCreate; state.ui.afterCreate=null;
    if(dest)navigate(dest,id); else navigate('clientdetail',id);
  };
  $('#ncCancel').onclick=()=>{state.ui.afterCreate=null;history.back()};
}

/* ---------------- CLIENTES ---------------- */
function showClientsView(){
  const draw=()=>{
    const q=($('#clientsSearch').value||'').toLowerCase();
    const list=state.clients.filter(c=>(c.nombre+' '+(c.dni||'')+' '+(c.celular||'')).toLowerCase().includes(q)).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
    $('#clientsList').innerHTML=list.length?list.map(c=>{const total=Object.values(c.deuda||{}).reduce((s,x)=>s+Number(x.CAJA||0)+Number(x.UNIDAD||0),0);
      return `<button type="button" class="item client-pick" data-id="${esc(c.id)}"><div style="display:flex;align-items:center;gap:12px;min-width:0"><div class="avatar">${esc(initials(c.nombre))}</div><div style="min-width:0"><b>${esc(c.nombre)}</b><small>${esc(c.celular||'Sin celular')}</small></div></div>${total?`<span class="tag warn">${total} pend.</span>`:CHEVRON}</button>`}).join(''):emptyState('No hay clientes registrados todavía. Usa el botón de arriba para crear el primero.');
    $('#clientsList').querySelectorAll('.client-pick').forEach(b=>b.onclick=()=>navigate('clientdetail',b.dataset.id));
  };
  $('#clientsSearch').value='';
  $('#clientsSearch').oninput=draw; draw();
  $('#clientsNewBtn').onclick=()=>{state.ui.afterCreate=null;navigate('newclient')};
}

/* ---------------- CATEGORÍAS DE PRODUCTO ---------------- */
const CAT_KEYWORDS={
  CERVEZA:['PILSEN','CUSQUE','CRISTAL','CORONA','HEINEKEN','BACKUS','GOLDEN','BRAHMA','STELLA','MILLER','BUDWEISER','AGUILA','ÁGUILA','TRUJILLO','AREQUIPEÑA','SAN JUAN'],
  GASEOSA:['INCA KOLA','INKA KOLA','COCA COLA','COCA-COLA','SPRITE','FANTA','KOLA REAL','KR','GUARANA','GUARANÁ','SEVEN UP','7UP','PEPSI','CONCORDIA']
};
function categoryOf(productName){
  const name=String(productName||'').toUpperCase();
  const catalogMatch=state.catalog.tipos.find(t=>String(t.nombre).toUpperCase()===name);
  if(catalogMatch&&catalogMatch.categoria) return String(catalogMatch.categoria).toUpperCase();
  if(CAT_KEYWORDS.CERVEZA.some(k=>name.includes(k))) return 'CERVEZA';
  if(CAT_KEYWORDS.GASEOSA.some(k=>name.includes(k))) return 'GASEOSA';
  return 'OTROS';
}
const CAT_LABEL={GENERAL:'general',GASEOSA:'gaseosas',CERVEZA:'cerveza',OTROS:'otras categorías'};

/* ---------------- DASHBOARD ---------------- */
function clientCategoryTotals(client){
  const d=client.deuda||{}; const totals={GENERAL:0,GASEOSA:0,CERVEZA:0,OTROS:0};
  Object.entries(d).forEach(([prod,v])=>{
    const cajas=Number(v.CAJA||0); if(!cajas)return;
    totals.GENERAL+=cajas; totals[categoryOf(prod)]+=cajas;
  });
  return totals;
}
function showDashboardView(){
  const rows=state.clients.map(c=>({client:c,totals:clientCategoryTotals(c)}));
  const topOf=cat=>rows.filter(r=>r.totals[cat]>0).sort((a,b)=>b.totals[cat]-a.totals[cat])[0];
  const topGeneral=topOf('GENERAL'), topGaseosa=topOf('GASEOSA'), topCerveza=topOf('CERVEZA');
  $('#dashTop').innerHTML=`
    <div class="stat"><b>${topGeneral?topGeneral.totals.GENERAL:0}</b><small>Más cajas en general${topGeneral?': '+esc(topGeneral.client.nombre):''}</small></div>
    <div class="stat stat--teal"><b>${topGaseosa?topGaseosa.totals.GASEOSA:0}</b><small>Más gaseosas${topGaseosa?': '+esc(topGaseosa.client.nombre):''}</small></div>
    <div class="stat stat--amber"><b>${topCerveza?topCerveza.totals.CERVEZA:0}</b><small>Más cerveza${topCerveza?': '+esc(topCerveza.client.nombre):''}</small></div>
  `;
  let activeCat='GENERAL';
  const draw=()=>{
    const q=($('#dashSearch').value||'').toLowerCase();
    const list=rows.filter(r=>r.totals[activeCat]>0&&r.client.nombre.toLowerCase().includes(q)).sort((a,b)=>b.totals[activeCat]-a.totals[activeCat]);
    $('#dashList').innerHTML=list.length?list.map((r,i)=>`<button type="button" class="item rank-row client-pick" data-id="${esc(r.client.id)}"><div><span class="rank-badge">${i+1}</span><div class="rank-info"><b>${esc(r.client.nombre)}</b><small>${r.totals[activeCat]} cajas de ${CAT_LABEL[activeCat]}</small></div></div>${CHEVRON}</button>`).join(''):emptyState(`Ningún cliente tiene cajas pendientes de ${CAT_LABEL[activeCat]}.`);
    $('#dashList').querySelectorAll('.client-pick').forEach(b=>b.onclick=()=>navigate('clientdetail',b.dataset.id));
  };
  $('#dashFilters').querySelectorAll('.chip').forEach(b=>b.onclick=()=>{
    activeCat=b.dataset.cat;
    $('#dashFilters').querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===b));
    draw();
  });
  $('#dashFilters').querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x.dataset.cat==='GENERAL'));
  $('#dashSearch').value='';
  $('#dashSearch').oninput=draw;
  draw();
}

/* ---------------- MÁS OPCIONES ---------------- */
function showMoreView(){
  const isAdmin=state.user?.rol==='admin';
  const items=[
    {nav:'alerts',title:'Alertas',desc:'Urgentes, próximos y recordatorios generados automáticamente.'},
    {nav:'recovery',title:'Revisar cajas pendientes',desc:'Clientes ordenados por cantidad y antigüedad, para recuperación.'},
    {nav:'reminders',title:'Recordatorios',desc:'Crea, edita o desactiva avisos de eventos (ej. visita de Backus).'},
  ];
  if(isAdmin){
    items.push({nav:'products',title:'Productos y envases',desc:'Agrega, edita o elimina los productos disponibles (ej. Pilsen, Cusqueña).'});
    items.push({nav:'config',title:'Configuración',desc:'Días de morosidad, alerta y cantidad de cajas.'});
    items.push({nav:'users',title:'Usuarios y acceso',desc:'Administra el correo y PIN/contraseña de cada usuario.'});
    items.push({nav:'backup',title:'Copias de seguridad y mantenimiento',desc:'Genera o restaura una copia de seguridad, y limpia registros antiguos.'});
  }else{
    items.push({title:'Productos y envases',desc:'Solo el usuario Admin puede administrar el catálogo de productos.',locked:true});
    items.push({title:'Configuración',desc:'Solo disponible para el usuario Admin.',locked:true});
    items.push({title:'Usuarios y acceso',desc:'Solo el usuario Admin puede cambiar correos y PIN/contraseñas.',locked:true});
    items.push({title:'Copias de seguridad y mantenimiento',desc:'Solo el usuario Admin puede generar copias de seguridad o limpiar datos.',locked:true});
  }
  $('#moreList').innerHTML=items.map(it=>`<button type="button" class="item more-item" ${it.locked?'disabled':`data-nav="${it.nav}"`}><div><b>${esc(it.title)}</b><small>${esc(it.desc)}</small></div>${it.locked?'<span class="tag">Admin</span>':CHEVRON}</button>`).join('');
}

/* ---------------- DETALLE DE CLIENTE ---------------- */
function showClientDetail(id){
  const client=state.clients.find(c=>String(c.id)===String(id));
  const box=$('#cdContent');
  if(!client){box.innerHTML='<div class="item">Cliente no encontrado.</div>';return}
  const d=client.deuda||{};
  const rows=Object.entries(d).filter(([,v])=>debtHas_(v));
  const total=rows.reduce((s,[,v])=>s+debtTotalEnvases_(v),0);
  const hist=state.history.filter(m=>String(m.cliente_id)===String(id)).slice(0,8);
  const wa=waLink(client);
  box.innerHTML=`
    <div class="cd-header">
      <div class="cd-top">
        <div class="avatar">${esc(initials(client.nombre))}</div>
        <div>
          <h2>${esc(client.nombre)}</h2>
          <div class="cd-meta">${esc(client.celular||'Sin celular')}${client.dni?(' · DNI/RUC '+esc(client.dni)):''}${client.direccion?('<br>'+esc(client.direccion)):''}</div>
        </div>
      </div>
      <div class="cd-actions">
        <button type="button" class="primaryBtn" id="cdRegister">Registrar entrega</button>
        <button type="button" class="ghost" id="cdReturn" ${total?'':'disabled'}>Registrar devolución</button>
        ${wa?`<a class="ghost" id="cdWhatsapp" href="${wa}" target="_blank" rel="noopener">📱 Contactar por WhatsApp</a>`:''}
      </div>
    </div>
    <div class="section-title"><div><h2>Envases pendientes</h2></div></div>
    ${rows.length?`<div class="debt-table-wrap"><table class="debt-table"><thead><tr><th>Producto</th><th>Caja</th><th>Unidades</th><th>Caja completa</th></tr></thead><tbody>${rows.map(([p,v])=>{const d=debtDisplay_(p,v);return`<tr><td>${esc(p)}</td><td><b>${d.caja}</b>${d.dentro?`<small>${d.dentro} u. dentro</small>`:''}</td><td><b>${d.unidades}</b>${d.dentro?`<small>${d.dentro} dentro de caja${d.sueltas?` · ${d.sueltas} sueltas`:''}</small>`:''}</td><td><b>${d.completas}</b>${d.completas&&d.cap?`<small>${d.cap} u./caja</small>`:''}</td></tr>`}).join('')}</tbody></table></div><div class="debt-legend"></div>`:emptyState('Sin envases pendientes. Este cliente está al día.')}
    <div class="section-title"><div><h2>Movimientos recientes</h2></div></div>
    <div class="list">${hist.length?hist.map(m=>`<div class="item"><div><b>${esc(m.tipo_caja)}</b> · ${m.tipo_envase==='CAJA'?(Number(m.contenido_unidades||0)>0?`CAJA · ${m.contenido_unidades} U. DENTRO`:'CAJA COMPLETA'):(m.ubicacion_unidad==='EN_CAJA'?'UNIDAD · DENTRO DE CAJA':'UNIDAD')}<small>${esc(m.tipo_movimiento)}${m.fecha?' · '+fmtDate(m.fecha):''}</small></div><span class="tag ${m.tipo_movimiento==='DEVOLUCION'?'success':'warn'}">${m.cantidad}</span></div>`).join(''):emptyState('Sin movimientos locales registrados.')}</div>
  `;
  $('#cdRegister').onclick=()=>navigate('register',id);
  $('#cdReturn').onclick=()=>navigate('return',id);
}

/* ---------------- ADMIN: CONFIGURACIÓN ---------------- */
function showConfigView(){
  if(state.user?.rol!=='admin'){toast('Solo Admin puede cambiar la configuración.');navigate('home');return}
  const form=$('#cfgForm');
  $('#cfgOld').value=state.config.dias_morosidad||15;
  $('#cfgCrates').value=state.config.cantidad_cajas_alerta||10;
  $('#cfgClient').value=state.config.dias_alerta_cliente||15;
  $('#cfgReminder').value=state.config.dias_antes_recordatorio||3;
  $('#cfgCancel').onclick=()=>history.back();
  form.onsubmit=async e=>{
    e.preventDefault();
    if(!online()||!API_URL)return toast('La configuración requiere conexión.');
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;
    try{
      await api('guardarConfiguracion',{usuario:state.user.nombre,dias_morosidad:$('#cfgOld').value,cantidad_cajas_alerta:$('#cfgCrates').value,dias_alerta_cliente:$('#cfgClient').value,dias_antes_recordatorio:$('#cfgReminder').value});
      toast('Configuración guardada.');await loadData();navigate('more');
    }catch(e){toast(e.message)}finally{btn.disabled=false}
  };
}

/* ---------------- ADMIN: USUARIOS Y ACCESO ---------------- */
async function showUsersView(){
  if(state.user?.rol!=='admin'){
    toast('Solo Admin puede administrar los usuarios.');
    navigate('home');
    return;
  }
  const box=$('#usersList');
  box.innerHTML=emptyState('Cargando usuarios…');
  if(!online()||!API_URL){
    box.innerHTML=emptyState('La administración de usuarios requiere conexión.');
    return;
  }
  try{
    const users=await api('getUsuarios',{usuario:state.user.nombre});
    box.innerHTML=users.length?users.map(u=>`<button type="button" class="item user-item" data-user-id="${esc(u.id)}">
      <div><b>${esc(u.nombre)}</b><small>${esc(u.correo||'Sin correo registrado')} · ${String(u.rol).toLowerCase()==='admin'?'Admin':'Cajero'}${parseBoolFront_(u.activo)?' · Activo':' · Inactivo'}</small></div>
      <span class="chev">${CHEVRON}</span>
    </button>`).join(''):emptyState('No hay usuarios registrados.');
    box.querySelectorAll('[data-user-id]').forEach(b=>b.onclick=()=>openUserEdit_(users.find(u=>String(u.id)===String(b.dataset.userId))));
  }catch(e){
    box.innerHTML=emptyState('No se pudieron cargar los usuarios.');
    toast(e.message);
  }
}

function openUserEdit_(user){
  if(!user)return;
  const modal=$('#userModal');
  $('#userModalTitle').textContent='Editar usuario';
  $('#userModalName').textContent=user.nombre;
  $('#userEmail').value=user.correo||'';
  $('#userPin').value='';
  $('#userPin').placeholder='Dejar vacío para no cambiar';
  $('#userId').value=user.id;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(()=>$('#userEmail')?.focus(),0);
}
function closeUserModal(){
  $('#userModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function saveUserEdit_(e){
  e.preventDefault();
  if(!online()||!API_URL)return toast('Cambiar correo o PIN/contraseña requiere conexión.');
  const email=$('#userEmail').value.trim();
  const pin=$('#userPin').value.trim();
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return toast('Ingresa un correo válido.');
  if(pin && !/^\d{4,20}$/.test(pin))return toast('El PIN/contraseña debe tener entre 4 y 20 dígitos.');
  const btn=$('#userSave');
  btn.disabled=true;
  try{
    await api('actualizarUsuario',{usuario:state.user.nombre,id:$('#userId').value,correo:email,pin:pin});
    toast('Usuario actualizado.');
    closeUserModal();
    await showUsersView();
  }catch(err){toast(err.message)}finally{btn.disabled=false}
}

/* ---------------- ADMIN: PRODUCTOS Y ENVASES (catálogo) ---------------- */
const PROD_CAT_LABEL={CERVEZA:'Cerveza',GASEOSA:'Gaseosa',OTROS:'Otros'};
async function showProductsView(){
  if(state.user?.rol!=='admin'){
    toast('Solo Admin puede administrar los productos.');
    navigate('home');
    return;
  }
  const box=$('#productsList');
  box.innerHTML=emptyState('Cargando productos…');
  $('#productsNewBtn').onclick=()=>openProductEdit_(null);
  if(!online()||!API_URL){
    box.innerHTML=emptyState('La administración de productos requiere conexión.');
    return;
  }
  try{
    const products=await api('getTiposCaja',{usuario:state.user.nombre});
    renderProductsList_(products);
  }catch(e){
    box.innerHTML=emptyState('No se pudieron cargar los productos.');
    toast(e.message);
  }
}
function renderProductsList_(products){
  const sorted=[...products].sort((a,b)=>Number(b.activo)-Number(a.activo)||String(a.nombre).localeCompare(String(b.nombre)));
  const box=$('#productsList');
  box.innerHTML=sorted.length?sorted.map(p=>`<div class="item" style="align-items:flex-start">
    <div><b>${esc(p.nombre)}</b><small>${esc(PROD_CAT_LABEL[p.categoria]||p.categoria)} · ${esc(p.unidades_por_caja)} u./caja${p.activo?'':' · Desactivado'}</small></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
      <button type="button" class="ghost small" data-edit="${esc(p.id)}">Editar</button>
      ${p.activo?`<button type="button" class="ghost small" data-off="${esc(p.id)}">Eliminar</button>`:`<button type="button" class="ghost small" data-on="${esc(p.id)}">Reactivar</button>`}
    </div>
  </div>`).join(''):emptyState('No hay productos registrados todavía.');
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openProductEdit_(products.find(p=>String(p.id)===String(b.dataset.edit))));
  box.querySelectorAll('[data-off]').forEach(b=>b.onclick=()=>toggleProductActive_(products.find(p=>String(p.id)===String(b.dataset.off)),false));
  box.querySelectorAll('[data-on]').forEach(b=>b.onclick=()=>toggleProductActive_(products.find(p=>String(p.id)===String(b.dataset.on)),true));
}
async function toggleProductActive_(product,activo){
  if(!product)return;
  if(!online()||!API_URL)return toast('Esta acción requiere conexión.');
  if(!activo){
    const ok=await askConfirm('¿Eliminar producto?','"'+product.nombre+'" dejará de aparecer para nuevos registros. El historial de movimientos ya guardado no se modifica.','Eliminar');
    if(!ok)return;
  }
  try{
    await api('guardarTipoCaja',{usuario:state.user.nombre,id:product.id,nombre:product.nombre,categoria:product.categoria,unidades_por_caja:product.unidades_por_caja,activo:activo});
    toast(activo?'Producto reactivado.':'Producto eliminado.');
    await loadData();
    showProductsView();
  }catch(e){toast(e.message)}
}
function openProductEdit_(product){
  const modal=$('#productModal');
  $('#productModalTitle').textContent=product?'Editar producto':'Nuevo producto';
  $('#productId').value=product?product.id:'';
  $('#productName').value=product?product.nombre:'';
  $('#productCategory').value=product?product.categoria:'CERVEZA';
  $('#productUnits').value=product?product.unidades_por_caja:12;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(()=>$('#productName')?.focus(),0);
}
function closeProductModal(){
  $('#productModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function saveProductEdit_(e){
  e.preventDefault();
  if(!online()||!API_URL)return toast('Guardar un producto requiere conexión.');
  const nombre=$('#productName').value.trim();
  const categoria=$('#productCategory').value;
  const unidades=Number($('#productUnits').value);
  if(!nombre)return toast('El nombre del producto es obligatorio.');
  if(!Number.isInteger(unidades)||unidades<=0)return toast('Las unidades por caja deben ser un número entero mayor a cero.');
  const btn=$('#productSave');
  btn.disabled=true;
  try{
    const id=$('#productId').value;
    await api('guardarTipoCaja',{usuario:state.user.nombre,id:id||undefined,nombre,categoria,unidades_por_caja:unidades,activo:true});
    toast(id?'Producto actualizado.':'Producto creado.');
    closeProductModal();
    await loadData();
    showProductsView();
  }catch(err){toast(err.message)}finally{btn.disabled=false}
}

/* ---------------- ADMIN: COPIAS DE SEGURIDAD Y MANTENIMIENTO ---------------- */
function showBackupView(){
  if(state.user?.rol!=='admin'){toast('Solo Admin puede acceder a mantenimiento.');navigate('home');return}
  $('#cleanupDays').value=365;
  $('#backupProgress').classList.add('hidden');
  $('#backupProgress').textContent='';
  $('#backupGenerateBtn').onclick=generarCopiaSeguridad_;
  $('#backupUploadBtn').onclick=()=>$('#backupFileInput').click();
  $('#backupFileInput').onchange=onBackupFileSelected_;
  $('#cleanupBtn').onclick=limpiarRegistrosAntiguos_;
}

async function generarCopiaSeguridad_(){
  if(!online()||!API_URL)return toast('Generar la copia de seguridad requiere conexión.');
  const btn=$('#backupGenerateBtn');
  btn.disabled=true;const originalLabel=btn.textContent;btn.textContent='Generando…';
  try{
    const backup=await api('generarBackup',{usuario:state.user.nombre});
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const f=new Date();
    const p=n=>String(n).padStart(2,'0');
    const nombre=`backup_envases_${f.getFullYear()}-${p(f.getMonth()+1)}-${p(f.getDate())}_${p(f.getHours())}${p(f.getMinutes())}${p(f.getSeconds())}.json`;
    const a=document.createElement('a');
    a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast('Copia de seguridad descargada: '+nombre);
  }catch(e){toast('No se pudo generar la copia de seguridad: '+e.message)}
  finally{btn.disabled=false;btn.textContent=originalLabel}
}

async function onBackupFileSelected_(e){
  const file=e.target.files && e.target.files[0];
  e.target.value=''; // permite volver a elegir el mismo archivo si algo falla
  if(!file)return;
  if(!online()||!API_URL)return toast('Restaurar una copia de seguridad requiere conexión.');

  let backup;
  try{
    backup=JSON.parse(await file.text());
  }catch(err){return toast('El archivo no es una copia de seguridad válida (JSON inválido).')}
  if(!backup || typeof backup.hojas!=='object')return toast('El archivo no tiene el formato esperado de copia de seguridad.');

  const ok=await askConfirm(
    '¿Restaurar copia de seguridad?',
    'Esto reemplazará TODOS los datos actuales (clientes, movimientos, usuarios, configuración, etc.) por los de este archivo. Esta acción no se puede deshacer. ¿Deseas continuar?',
    'Sí, restaurar'
  );
  if(!ok)return;

  const btn=$('#backupUploadBtn');btn.disabled=true;
  const progress=$('#backupProgress');progress.classList.remove('hidden');
  const CHUNK=40;
  try{
    const hojas=backup.hojas;
    const nombresHoja=Object.keys(hojas);
    for(const hoja of nombresHoja){
      const filas=(hojas[hoja]&&hojas[hoja].filas)||[];
      if(!filas.length){
        progress.textContent=`Restaurando ${hoja}… (sin datos)`;
        await api('restaurarLote',{usuario:state.user.nombre,hoja,filas:[],limpiarAntes:true});
        continue;
      }
      let primerBloque=true;
      for(let i=0;i<filas.length;i+=CHUNK){
        const bloque=filas.slice(i,i+CHUNK);
        progress.textContent=`Restaurando ${hoja}… ${Math.min(i+CHUNK,filas.length)}/${filas.length}`;
        await api('restaurarLote',{usuario:state.user.nombre,hoja,filas:bloque,limpiarAntes:primerBloque});
        primerBloque=false;
      }
    }
    progress.textContent='Reconstruyendo cachés y notificaciones…';
    await api('finalizarRestauracion',{usuario:state.user.nombre});
    toast('Copia de seguridad restaurada correctamente.');
    await loadData();
    navigate('more');
  }catch(e){
    toast('Ocurrió un error restaurando la copia: '+e.message+'. Verifica los datos; algunas pestañas pueden haber quedado parcialmente restauradas.');
  }finally{
    btn.disabled=false;
    progress.classList.add('hidden');
  }
}

async function limpiarRegistrosAntiguos_(){
  if(!online()||!API_URL)return toast('Limpiar registros antiguos requiere conexión.');
  const dias=Number($('#cleanupDays').value);
  if(!Number.isFinite(dias)||dias<30)return toast('La antigüedad mínima permitida es de 30 días.');
  const ok=await askConfirm(
    '¿Eliminar registros antiguos?',
    `Se eliminará el historial de movimientos de clientes sin ninguna caja o unidad pendiente y sin actividad en los últimos ${dias} días, además de notificaciones ya atendidas de esa antigüedad. Los clientes con envases pendientes nunca se ven afectados. Esta acción no se puede deshacer.`,
    'Sí, eliminar'
  );
  if(!ok)return;
  const btn=$('#cleanupBtn');
  btn.disabled=true;const originalLabel=btn.textContent;btn.textContent='Eliminando…';
  try{
    const res=await api('limpiarDatosAntiguos',{usuario:state.user.nombre,dias});
    toast(`Listo: ${res.movimientosEliminados} movimientos de ${res.clientesLimpiados} cliente(s) saldados y ${res.notificacionesEliminadas} notificación(es) antigua(s) eliminadas.`);
    await loadData();
  }catch(e){toast(e.message)}
  finally{btn.disabled=false;btn.textContent=originalLabel}
}

/* ---------------- RECORDATORIOS: crear / editar ---------------- */
function showReminderView(id){
  const editing=id?state.reminders.find(r=>String(r.id)===String(id)):null;
  $('#remHead').textContent=editing?'Editar recordatorio':'Crear recordatorio';
  $('#remTitle').value=editing?editing.titulo:'';
  $('#remDesc').value=editing?editing.descripcion:'';
  $('#remDate').value=editing?toLocalInput_(editing.fecha_evento):'';
  $('#remDays').value=editing?editing.dias_antes:(state.config.dias_antes_recordatorio||3);
  $('#remCancel').onclick=()=>navigate('reminders');
  $('#remForm').onsubmit=async e=>{
    e.preventDefault();
    const d={titulo:$('#remTitle').value,descripcion:$('#remDesc').value,fecha_evento:$('#remDate').value,dias_antes:Number($('#remDays').value),creado_por:state.user.nombre};
    if(!d.titulo.trim()||!d.fecha_evento)return toast('Título y fecha son obligatorios.');
    if(!online()||!API_URL)return toast('Crear o editar un recordatorio requiere conexión.');
    const btn=$('#remForm').querySelector('button[type=submit]');btn.disabled=true;
    try{
      if(editing)await api('editarRecordatorio',{...d,id:editing.id,usuario:state.user.nombre});
      else await api('crearRecordatorio',d);
      toast(editing?'Recordatorio actualizado.':'Recordatorio creado.');
      await loadData();navigate('reminders');
    }catch(e){toast(e.message)}finally{btn.disabled=false}
  };
}
function toLocalInput_(d){const dt=new Date(d);if(isNaN(dt))return'';const off=dt.getTimezoneOffset();return new Date(dt.getTime()-off*60000).toISOString().slice(0,16)}

/* ---------------- RECORDATORIOS: listado (editar / desactivar) ---------------- */
function showRemindersView(){
  const isAdmin=state.user?.rol==='admin';
  const list=[...state.reminders].sort((a,b)=>new Date(a.fecha_evento)-new Date(b.fecha_evento));
  $('#remindersNewBtn').onclick=()=>navigate('reminder');
  $('#remindersList').innerHTML=list.length?list.map(r=>{
    const active=parseBoolFront_(r.activo);
    const vencido=new Date(r.fecha_evento).getTime()<Date.now();
    const canEdit=isAdmin||String(r.creado_por).toLowerCase()===String(state.user.nombre).toLowerCase();
    return `<div class="item" style="align-items:flex-start">
      <div><b>${esc(r.titulo)}</b><small>${esc(r.descripcion||'')}<br>${vencido&&active?'⚠️ Evento vencido · ':''}${fmtDate(r.fecha_evento)} · avisa ${esc(r.dias_antes)} día(s) antes · creado por ${esc(r.creado_por)}</small></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <span class="tag ${active?(vencido?'warn':'success'):''}">${active?(vencido?'Vencido':'Activo'):'Desactivado'}</span>
        ${canEdit&&active?`<div style="display:flex;gap:6px"><button type="button" class="ghost small" data-edit="${esc(r.id)}">Editar</button><button type="button" class="ghost small" data-off="${esc(r.id)}">Desactivar</button></div>`:''}
      </div>
    </div>`;
  }).join(''):emptyState('No hay recordatorios creados todavía.');
  $('#remindersList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>navigate('reminder',b.dataset.edit));
  $('#remindersList').querySelectorAll('[data-off]').forEach(b=>b.onclick=async()=>{
    if(!online()||!API_URL)return toast('Desactivar requiere conexión.');
    b.disabled=true;
    try{await api('desactivarRecordatorio',{id:b.dataset.off,usuario:state.user.nombre});toast('Recordatorio desactivado.');await loadData();showRemindersView()}catch(e){toast(e.message);b.disabled=false}
  });
}
function parseBoolFront_(v){return v===true||String(v).toLowerCase()==='true'}

/* ---------------- ALERTAS Y RECORDATORIOS (🔴 urgentes · 🟠 próximos · 🟡 recordatorios) ---------------- */
const ALERT_FILTERS=[
  {id:'TODOS',label:'Todos'},
  {id:'MUCHAS_CAJAS',label:'Muchas cajas'},
  {id:'DEUDA_ANTIGUA',label:'Deuda antigua'},
  {id:'MOROSOS',label:'Morosos'},
  {id:'PROXIMOS',label:'Próx. recordatorios'},
  {id:'ATENDIDAS',label:'Atendidas'}
];
function matchesAlertFilter_(n,f){
  if(f==='TODOS')return String(n.estado)==='PENDIENTE';
  if(f==='ATENDIDAS')return String(n.estado)==='ATENDIDA';
  if(String(n.estado)!=='PENDIENTE')return false;
  if(f==='MUCHAS_CAJAS')return n.tipo==='MUCHAS_CAJAS'||n.tipo==='CLIENTE_PRIORITARIO';
  if(f==='DEUDA_ANTIGUA')return n.tipo==='DEUDA_ANTIGUA';
  if(f==='MOROSOS')return n.tipo==='MOROSIDAD'||n.tipo==='CLIENTE_PRIORITARIO';
  if(f==='PROXIMOS')return n.tipo==='EVENTO_PROXIMO'||n.tipo==='EVENTO_HOY';
  return true;
}
function alertItemHTML_(n){
  const client=n.cliente_id?state.clients.find(c=>String(c.id)===String(n.cliente_id)):null;
  const wa=client?waLink(client):null;
  const prio=n.prioridad==='ALTA'?'danger':n.prioridad==='MEDIA'?'warn':'';
  const atendida=String(n.estado)==='ATENDIDA';
  return `<div class="item" style="align-items:flex-start">
    <div><b>${esc(n.titulo)}</b><small>${esc(n.mensaje)}<br>${fmtDate(n.fecha_generacion)}${atendida?' · Atendida por '+esc(n.atendida_por||'—'):''}</small></div>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
      <span class="tag ${prio}">${esc(n.prioridad)}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${client?`<button type="button" class="ghost small" data-ver="${esc(client.id)}">Ver</button>`:''}
        ${wa?`<a class="ghost small" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>`:''}
        ${!atendida?`<button type="button" class="primaryBtn small" data-atender="${esc(n.id)}">✓ Atendida</button>`:''}
      </div>
    </div>
  </div>`;
}
function showAlertsView(){
  $('#alertsFilters').innerHTML=ALERT_FILTERS.map(f=>`<button type="button" class="chip ${state.ui.alertsFilter===f.id?'active':''}" data-f="${f.id}">${esc(f.label)}</button>`).join('');
  $('#alertsFilters').querySelectorAll('.chip').forEach(b=>b.onclick=()=>{state.ui.alertsFilter=b.dataset.f;showAlertsView()});
  const list=state.notifications.filter(n=>matchesAlertFilter_(n,state.ui.alertsFilter));
  const urgentes=list.filter(n=>n.prioridad==='ALTA'&&n.estado==='PENDIENTE');
  const proximos=list.filter(n=>n.prioridad==='MEDIA'&&n.estado==='PENDIENTE');
  const recordatorios=list.filter(n=>n.prioridad==='INFO'&&n.estado==='PENDIENTE');
  const atendidas=list.filter(n=>n.estado==='ATENDIDA');
  const group=(title,icon,items)=>items.length?`<div class="section-title"><div><h2>${icon} ${title}</h2></div></div><div class="list">${items.map(alertItemHTML_).join('')}</div>`:'';
  const html=group('URGENTES','🔴',urgentes)+group('PRÓXIMOS','🟠',proximos)+group('RECORDATORIOS','🟡',recordatorios)+group('ATENDIDAS','✓',atendidas);
  $('#alertsList').innerHTML=html||emptyState('No hay alertas para este filtro.');
  $('#alertsList').querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>navigate('clientdetail',b.dataset.ver));
  $('#alertsList').querySelectorAll('[data-atender]').forEach(b=>b.onclick=async()=>{
    if(!online()||!API_URL)return toast('Marcar como atendida requiere conexión.');
    b.disabled=true;
    try{await api('marcarNotificacionAtendida',{id:b.dataset.atender,atendida_por:state.user.nombre});await loadData();showAlertsView()}catch(e){toast(e.message);b.disabled=false}
  });
}

/* ---------------- PANEL OPERATIVO: RECUPERACIÓN DE ENVASES ---------------- */
async function showRecoveryView(){
  $('#recoveryList').innerHTML=emptyState('Cargando…');
  let rows=[];
  try{
    rows=online()&&API_URL?await api('getPanelRecuperacion'):state.clients.map(c=>{
      const deuda=c.deuda||{};const total=Object.values(deuda).reduce((s,v)=>s+debtTotalEnvases_(v),0);
      return{cliente:c,deuda,totalCajas:total,dias:0};
    }).filter(x=>x.totalCajas>0).sort((a,b)=>b.totalCajas-a.totalCajas);
  }catch(e){toast(e.message)}
  $('#recoveryList').innerHTML=rows.length?rows.map(r=>{
    const productos=Object.entries(r.deuda||{}).map(([p,v])=>`${p}: ${debtSummaryText_(p,v)}`).join(' · ');
    const wa=waLink({...r.cliente,deuda:r.deuda});
    return `<div class="item" style="align-items:flex-start">
      <div><b>${esc(r.cliente.nombre)}</b><small>${r.totalCajas} pendientes · ${r.dias} días de antigüedad<br>${esc(productos)}</small></div>
      <div style="display:flex;gap:6px">
        <button type="button" class="ghost small" data-ver="${esc(r.cliente.id)}">Ver</button>
        ${wa?`<a class="ghost small" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>`:''}
      </div>
    </div>`;
  }).join(''):emptyState('No hay clientes con envases pendientes por recuperar.');
  $('#recoveryList').querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>navigate('clientdetail',b.dataset.ver));
}

/* ---------------- SYNC ---------------- */
async function syncPending(){
  if(!online()||!API_URL||!state.pending.length)return;
  const batch=[...state.pending];
  try{
    const res=await api('syncMovements',batch);
    const done=new Set((res.resultados||[]).filter(x=>x.ok).map(x=>x.id_offline_temp));
    state.pending=state.pending.filter(x=>!done.has(x.id_offline_temp));saveState();toast(done.size?'Sincronización completada.':'Sincronización pendiente');
    await loadData();
  }catch(e){toast('Sincronización pendiente: '+e.message)}
}
window.addEventListener('online',()=>{setConnection();syncPending()});window.addEventListener('offline',setConnection);

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
render(); // primer pintado inmediato (login) mientras se lee IndexedDB
(async function boot(){
  await loadLocalState();
  render();
  await loadData();
  await syncPending();
})();
