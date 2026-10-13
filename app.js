import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const $ = (id) => document.getElementById(id);
const state = { session:null, userID:null, accesses:[], access:null, bundle:null, channel:null, timer:null, hold:null, holdStart:0 };

const roleNames = {
  administrator:"Administrator", incidentCommander:"Einsatzleitung",
  alarmInitiator:"Alarmauslöser", managerObserver:"Manager / Beobachter",
  fireSafetyOfficer:"Brandschutz", evacuationAssistant:"Evakuierungshelfer",
  firstResponder:"Ersthelfer"
};
const defaults = {
  administrator:["triggerAlarm","respondToAlarm","viewLiveOverview","updateAreaStatus","useQuickActions","postIncidentUpdates","setIncidentLocation","manageIncident","viewHistory","exportReport","addAttachments","editFireProtocol"],
  incidentCommander:["triggerAlarm","respondToAlarm","viewLiveOverview","updateAreaStatus","useQuickActions","postIncidentUpdates","setIncidentLocation","manageIncident","viewHistory","exportReport","addAttachments","editFireProtocol"],
  alarmInitiator:["triggerAlarm","respondToAlarm","viewLiveOverview","viewHistory"],
  managerObserver:["viewLiveOverview","postIncidentUpdates","viewHistory","exportReport"],
  fireSafetyOfficer:["respondToAlarm","viewLiveOverview","updateAreaStatus","viewHistory"],
  evacuationAssistant:["respondToAlarm","viewLiveOverview","updateAreaStatus","viewHistory"],
  firstResponder:["respondToAlarm","viewLiveOverview","viewHistory"]
};
const statusNames = { pending:"Offen", evacuating:"Räumung läuft", cleared:"Geräumt" };
const icons = {alarm_created:"🚨",response:"👤",area_cleared:"✅",area_status:"🏭",fire_brigade_on_site:"🚒",police_on_site:"🚓",ems_on_site:"🚑",incident_location_set:"📍",update:"📝",all_clear:"🟢",false_alarm:"⚠️",fire_protocol_saved:"📄",fire_protocol_updated:"📄"};

const esc = (v="") => String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const same = (a,b) => String(a||"").toLowerCase() === String(b||"").toLowerCase();
const uuid = () => crypto.randomUUID().toUpperCase();
const now = () => new Date().toISOString();
const fmt = (v,date=true) => {
  if(!v) return "–";
  const d=new Date(v); if(Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("de-DE",{...(date?{dateStyle:"short"}:{}),timeStyle:"medium"}).format(d);
};
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");clearTimeout($("toast")._t);$("toast")._t=setTimeout(()=>$("toast").classList.add("hidden"),3200)}
function conn(mode,text){$("conn").className=`pill ${mode||""}`;$("conn").textContent=text}
function curMember(){return (state.bundle?.memberships||[]).find(m=>same(m.user_id,state.userID))||null}
function perms(){const m=curMember();return m?(m.permissions?.length?m.permissions:(defaults[m.role]||[])):[]}
function can(p){return curMember()?.role==="administrator"||perms().includes(p)}
function org(){return state.bundle?.organization||null}
function activeAlerts(){return (state.bundle?.alerts||[]).filter(a=>a.state==="active").sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))}
function active(){return activeAlerts()[0]||null}
function areas(){return (org()?.areas||[]).filter(a=>a.isEnabled!==false)}
function sites(){return (org()?.sites||[]).filter(s=>s.isEnabled!==false)}
function area(id){return areas().find(a=>same(a.id,id))}
function site(id){return sites().find(s=>same(s.id,id))}
function member(id){return (state.bundle?.memberships||[]).find(m=>same(m.user_id,id))}
function locationOf(a){if(a?.incidentLocation?.latitude) return a.incidentLocation; return [...(a?.eventLog||[])].reverse().find(e=>e.incidentLocation)?.incidentLocation||null}

async function ensureSession(){
  conn("","Verbinde…");
  let {data:{session}}=await sb.auth.getSession();
  if(!session){const r=await sb.auth.signInAnonymously();if(r.error)throw r.error;session=r.data.session}
  state.session=session;state.userID=session.user.id;
}

async function loadAccesses(){
  const r=await sb.rpc("alertline_list_my_organizations"); if(r.error)throw r.error;
  state.accesses=r.data||[];
  if(!state.accesses.length){$("join").classList.remove("hidden");$("dash").classList.add("hidden");conn("online","Bereit");return}
  const saved=localStorage.getItem("evacpilot_web_org");
  state.access=state.accesses.find(x=>same(x.organization_id,saved))||state.accesses[0];
  localStorage.setItem("evacpilot_web_org",state.access.organization_id);
  await loadBundle();
}
async function loadBundle(silent=false){
  if(!state.access)return;
  if(!silent)conn("","Synchronisiere…");
  const r=await sb.rpc("alertline_get_my_organization_bundle",{org:state.access.organization_id});
  if(r.error)throw r.error;
  state.bundle=r.data;render();subscribe();conn("online","Live verbunden");
}
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(()=>loadBundle(true).catch(err=>{console.error(err);conn("offline","Sync-Fehler")}),250)}
function subscribe(){
  if(state.channel){sb.removeChannel(state.channel);state.channel=null}
  const id=state.access.organization_id;
  const ch=sb.channel(`evacpilot-web-${id}-${Date.now()}`);
  ["alerts","memberships","organization_documents","invite_codes"].forEach(table=>{
    ch.on("postgres_changes",{event:"*",schema:"public",table,filter:`organization_id=eq.${id}`},schedule);
  });
  ch.subscribe(s=>{if(s==="SUBSCRIBED")conn("online","Live verbunden");if(s==="CHANNEL_ERROR"||s==="TIMED_OUT")conn("offline","Realtime getrennt")});
  state.channel=ch;
}

function render(){
  $("join").classList.add("hidden");$("dash").classList.remove("hidden");
  const m=curMember(), a=active(), actives=activeAlerts();
  $("orgName").textContent=org()?.name||state.access.organization_name||"EvacPilot";
  $("orgMeta").textContent=`${roleNames[m?.role]||m?.role||"Mitglied"} · ${state.access.contract_license_active?`Vertrag bis ${state.access.contract_valid_until||"aktiv"}`:"Lizenz aktiv"}`;
  renderOrgSelect();
  const prog=a?.areaProgress||[]; const cleared=prog.filter(x=>x.status==="cleared").length;
  const siteAreas=a?.siteID?areas().filter(x=>same(x.siteID,a.siteID)):areas();
  $("kpiAlarms").textContent=actives.length;
  $("kpiAreas").textContent=`${cleared} / ${siteAreas.length||areas().length}`;
  $("kpiResponses").textContent=a?.responses?.length||0;
  $("kpiMembers").textContent=(state.bundle?.memberships||[]).filter(x=>x.active&&!x.deleted_at).length;
  $("alarmOpen").classList.toggle("hidden",!can("triggerAlarm"));
  renderMembers();renderHistory();

  if(!a){$("empty").classList.remove("hidden");$("incident").classList.add("hidden");return}
  $("empty").classList.add("hidden");$("incident").classList.remove("hidden");
  const an=(a.areaIDs||[]).map(id=>area(id)?.name).filter(Boolean);
  $("alarmTitle").textContent=a.type==="fire"?"Feueralarm":"Aktiver Alarm";
  $("alarmMeta").textContent=[site(a.siteID)?.name,an.join(", "),`seit ${fmt(a.createdAt)}`].filter(Boolean).join(" · ");
  $("allClear").classList.toggle("hidden",!can("manageIncident"));
  $("falseAlarm").classList.toggle("hidden",!can("manageIncident"));
  $("updateForm").classList.toggle("hidden",!can("postIncidentUpdates"));
  $("setLoc").classList.toggle("hidden",!can("setIncidentLocation")||!!locationOf(a));
  document.querySelectorAll(".quick button").forEach(b=>b.disabled=!can("useQuickActions"));
  renderAreas(a);renderResponses(a);renderTimeline(a);renderLocation(a);
}
function renderOrgSelect(){
  $("orgSelect").innerHTML=state.accesses.map(x=>`<option value="${esc(x.organization_id)}">${esc(x.organization_name)}</option>`).join("");
  $("orgSelect").value=state.access.organization_id;$("orgSelect").classList.toggle("hidden",state.accesses.length<=1);
}
function renderAreas(a){
  let list=a.siteID?areas().filter(x=>same(x.siteID,a.siteID)):areas();
  const m=curMember(), assigned=m?.area_ids||[];
  if(m?.role!=="administrator"&&assigned.length)list=list.filter(x=>assigned.some(id=>same(id,x.id)));
  $("areaCount").textContent=`${list.length} Bereiche`;
  $("areas").innerHTML=list.map(ar=>{
    const p=(a.areaProgress||[]).find(x=>same(x.areaID,ar.id)); const s=p?.status||"pending";
    const controls=(can("updateAreaStatus")||can("useQuickActions"))?`<div class="area-actions"><button data-area="${esc(ar.id)}" data-status="evacuating">Räumung läuft</button><button data-area="${esc(ar.id)}" data-status="cleared">Geräumt</button></div>`:"";
    return `<div class="area"><div><b>${esc(ar.name)}</b><div class="status ${esc(s)}">${esc(statusNames[s]||s)}</div></div>${controls}</div>`;
  }).join("");
  $("areas").querySelectorAll("[data-area]").forEach(b=>b.onclick=()=>setAreaStatus(b.dataset.area,b.dataset.status).catch(handle));
}
function renderResponses(a){
  const rs=[...(a.responses||[])].sort((x,y)=>new Date(y.updatedAt)-new Date(x.updatedAt));
  $("responses").innerHTML=rs.length?rs.map(r=>{const m=member(r.memberID);const s={onSite:"Vor Ort",coming:"Auf dem Weg",unavailable:"Nicht verfügbar"}[r.status]||r.status;return `<div class="row"><div><b>${esc(m?.display_name||"Mitarbeiter")}</b><div class="sub">${esc(fmt(r.updatedAt,false))}</div></div><span class="badge">${esc(s)}</span></div>`}).join(""):`<span class="sub">Noch keine Rückmeldungen.</span>`;
}
function renderTimeline(a){
  const ev=[...(a.eventLog||[])].sort((x,y)=>new Date(y.timestamp)-new Date(x.timestamp));
  $("timeline").innerHTML=ev.length?ev.map(e=>{const m=member(e.memberID);return `<div class="event"><div>${icons[e.kind]||"•"} ${esc(e.text||e.kind)}</div><div class="sub">${esc(fmt(e.timestamp))}${m?` · ${esc(m.display_name)}`:""}</div></div>`}).join(""):`<span class="sub">Noch keine Ereignisse.</span>`;
}
function renderLocation(a){
  const l=locationOf(a); if(!l?.latitude){$("locBox").classList.add("hidden");return}
  $("locBox").classList.remove("hidden");$("locText").textContent=l.note||`${Number(l.latitude).toFixed(6)}, ${Number(l.longitude).toFixed(6)}`;
  $("locLink").href=`https://maps.apple.com/?ll=${encodeURIComponent(l.latitude)},${encodeURIComponent(l.longitude)}&q=EvacPilot%20Einsatzort`;
}
function renderMembers(){
  const ms=(state.bundle?.memberships||[]).filter(m=>m.active&&!m.deleted_at).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),"de"));
  $("memberCount").textContent=`${ms.length} aktiv`;
  $("members").innerHTML=ms.map(m=>{const an=(m.area_ids||[]).map(id=>area(id)?.name).filter(Boolean);return `<div class="row"><div><b>${esc(m.display_name||"Mitarbeiter")}</b><div class="sub">${esc(an.length?an.join(", "):"Gesamt / keine Bereichsbeschränkung")}</div></div><span class="badge">${esc(roleNames[m.role]||m.role)}</span></div>`}).join("");
}
function renderHistory(){
  const hs=(state.bundle?.alerts||[]).filter(a=>a.state!=="active").sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,12);
  $("history").innerHTML=hs.length?hs.map(a=>`<div class="row"><div><b>${a.type==="fire"?"Feueralarm":esc(a.type||"Alarm")}</b><div class="sub">${esc(site(a.siteID)?.name||"")}${site(a.siteID)?" · ":""}${esc(fmt(a.createdAt))}</div></div><span class="badge">${a.state==="resolved"?"Beendet":esc(a.state)}</span></div>`).join(""):`<span class="sub">Noch keine abgeschlossenen Einsätze.</span>`;
}

async function join(e){
  e.preventDefault();$("joinMsg").textContent="";
  const r=await sb.rpc("alertline_redeem_invite",{invite_code:$("code").value.trim().toUpperCase(),display_name:$("name").value.trim(),member_email:$("email").value.trim()});
  if(r.error)throw r.error;toast("Leitstand verbunden.");await loadAccesses();
}
function fillAlarm(){
  $("alarmSite").innerHTML=sites().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  const build=()=>{$("alarmAreas").innerHTML=areas().filter(a=>same(a.siteID,$("alarmSite").value)).map(a=>`<label class="checkitem"><input type="checkbox" name="alarmArea" value="${esc(a.id)}"> ${esc(a.name)}</label>`).join("")};
  $("alarmSite").onchange=build;build();
}
async function createAlarm(e){
  e.preventDefault();if(!can("triggerAlarm"))throw new Error("Keine Berechtigung.");
  const ids=[...document.querySelectorAll('input[name="alarmArea"]:checked')].map(x=>x.value);if(!ids.length){toast("Bitte mindestens einen Bereich auswählen.");return}
  const id=uuid(), createdAt=now(), siteID=$("alarmSite").value, detail=$("alarmDetails").value.trim(), called=$("servicesCalled").checked;
  const names=ids.map(id=>area(id)?.name).filter(Boolean);
  const payload={id,type:"fire",state:"active",siteID,areaIDs:ids,details:detail,updates:[],eventLog:[{id:uuid(),kind:"alarm_created",text:`Feueralarm ausgelöst in ${names.join(", ")||"Bereich"}`,memberID:state.userID,timestamp:createdAt}],createdAt,createdBy:state.userID,responses:[],areaProgress:[],emergencyServicesCalled:called};
  const r=await sb.from("alerts").insert({id,organization_id:state.access.organization_id,state:"active",type:"fire",area_ids:ids,details:detail,emergency_services_called:called,payload,created_by:state.userID,created_at:createdAt,resolved_at:null});
  if(r.error)throw r.error;$("alarmDlg").close();$("alarmForm").reset();toast("Alarm angelegt. Push wird versendet…");await dispatchPush(id);await loadBundle(true);
}
async function dispatchPush(id){
  const {data:{session}}=await sb.auth.getSession();
  const res=await fetch(`${SUPABASE_URL}/functions/v1/alertline-push`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({alert_id:id})});
  toast(res.ok?"Alarm und Push ausgelöst.":"Alarm gespeichert, Push konnte nicht bestätigt werden.");
}
async function setAreaStatus(areaID,status){
  const a=active();if(!a||!(can("updateAreaStatus")||can("useQuickActions")))return;
  const p=structuredClone(a), t=now();p.areaProgress||=[];p.eventLog||=[];
  const i=p.areaProgress.findIndex(x=>same(x.areaID,areaID));const item={id:i>=0?p.areaProgress[i].id:uuid(),note:"",areaID,status,updatedAt:t,updatedBy:state.userID};
  if(i>=0)p.areaProgress[i]=item;else p.areaProgress.push(item);
  p.eventLog.push({id:uuid(),kind:status==="cleared"?"area_cleared":"area_status",text:status==="cleared"?`${area(areaID)?.name||"Bereich"} geräumt`:`${area(areaID)?.name||"Bereich"}: Räumung läuft`,memberID:state.userID,timestamp:t});
  const r=await sb.rpc("alertline_update_operational_alert",{alert_id:a.id,new_payload:p});if(r.error)throw r.error;toast("Bereichsstatus aktualisiert.");await loadBundle(true);
}
async function quick(kind,text){
  const a=active();if(!a||!can("useQuickActions"))return;const p=structuredClone(a);p.eventLog||=[];p.eventLog.push({id:uuid(),kind,text,memberID:state.userID,timestamp:now()});
  const r=await sb.rpc("alertline_update_operational_alert",{alert_id:a.id,new_payload:p});if(r.error)throw r.error;toast(text);await loadBundle(true);
}
async function postUpdate(e){
  e.preventDefault();const a=active(),text=$("updateText").value.trim();if(!a||!text||!can("postIncidentUpdates"))return;const t=now();
  const r=await sb.rpc("alertline_post_incident_update",{alert_id:a.id,new_update:{id:uuid(),text,authorID:state.userID,createdAt:t},new_event:{id:uuid(),timestamp:t,kind:"update",text,memberID:state.userID}});
  if(r.error)throw r.error;$("updateText").value="";toast("Einsatzmeldung gesendet.");await loadBundle(true);
}
async function falseAlarm(){
  const a=active();if(!a||!can("manageIncident"))return;const p=structuredClone(a);p.eventLog||=[];p.eventLog.push({id:uuid(),kind:"false_alarm",text:"Fehlalarm markiert",memberID:state.userID,timestamp:now()});
  const r=await sb.rpc("alertline_update_operational_alert",{alert_id:a.id,new_payload:p});if(r.error)throw r.error;toast("Fehlalarm markiert. Einsatz bleibt aktiv.");await loadBundle(true);
}
function startHold(){
  if(!can("manageIncident")||!active())return;stopHold();state.holdStart=performance.now();
  state.hold=setInterval(async()=>{const p=Math.min(1,(performance.now()-state.holdStart)/3000);$("allClear").querySelector(".fill").style.width=`${p*100}%`;if(p>=1){stopHold();try{await resolve()}catch(e){handle(e)}}},45);
}
function stopHold(){if(state.hold)clearInterval(state.hold);state.hold=null;const f=$("allClear")?.querySelector(".fill");if(f)f.style.width="0%"}
async function resolve(){
  const a=active();if(!a||!can("manageIncident"))return;const p=structuredClone(a),t=now();p.state="resolved";p.resolvedAt=t;p.resolvedBy=state.userID;p.eventLog||=[];p.eventLog.push({id:uuid(),kind:"all_clear",text:"Entwarnung",memberID:state.userID,timestamp:t});
  const r=await sb.rpc("alertline_update_operational_alert",{alert_id:a.id,new_payload:p});if(r.error)throw r.error;toast("Entwarnung gesendet.");await loadBundle(true);
}
async function setLocation(e){
  e.preventDefault();const a=active();if(!a||!can("setIncidentLocation"))return;if(!navigator.geolocation)throw new Error("Standortbestimmung nicht unterstützt.");
  $("locConfirm").disabled=true;
  try{
    const pos=await new Promise((ok,no)=>navigator.geolocation.getCurrentPosition(ok,no,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
    const r=await sb.rpc("alertline_set_incident_location",{alert_id:a.id,location_latitude:pos.coords.latitude,location_longitude:pos.coords.longitude,location_note:$("locNote").value.trim(),event_text:"Einsatzort markiert"});
    if(r.error)throw r.error;$("locDlg").close();toast("Einsatzort gesetzt.");await loadBundle(true);
  }finally{$("locConfirm").disabled=false}
}
async function switchOrg(e){state.access=state.accesses.find(x=>same(x.organization_id,e.target.value));localStorage.setItem("evacpilot_web_org",state.access.organization_id);await loadBundle()}
async function logout(){if(state.channel)await sb.removeChannel(state.channel);await sb.auth.signOut({scope:"local"});localStorage.removeItem("evacpilot_web_org");location.reload()}
function human(e){const m=String(e?.message||e||"");if(/invalid or expired invite/i.test(m))return"Einladungscode ungültig oder bereits verwendet.";if(/not authorized/i.test(m))return"Keine Berechtigung.";if(/network|fetch/i.test(m))return"Verbindung zum Backend fehlgeschlagen.";return m||"Unbekannter Fehler."}
function handle(e){console.error(e);toast(human(e))}

function bind(){
  $("joinForm").onsubmit=e=>join(e).catch(err=>{$("joinMsg").textContent=human(err)});
  $("refresh").onclick=()=>loadBundle().catch(handle);
  $("orgSelect").onchange=e=>switchOrg(e).catch(handle);
  $("logout").onclick=()=>logout().catch(handle);
  $("alarmOpen").onclick=()=>{fillAlarm();$("alarmDlg").showModal()};
  $("alarmClose").onclick=$("alarmCancel").onclick=()=>$("alarmDlg").close();
  $("alarmForm").onsubmit=e=>createAlarm(e).catch(handle);
  document.querySelectorAll(".quick button").forEach(b=>b.onclick=()=>quick(b.dataset.kind,b.dataset.text).catch(handle));
  $("updateForm").onsubmit=e=>postUpdate(e).catch(handle);
  $("falseAlarm").onclick=()=>falseAlarm().catch(handle);
  $("allClear").onpointerdown=startHold;$("allClear").onpointerup=stopHold;$("allClear").onpointerleave=stopHold;$("allClear").onpointercancel=stopHold;
  $("setLoc").onclick=()=>$("locDlg").showModal();
  $("locClose").onclick=$("locCancel").onclick=()=>$("locDlg").close();
  $("locForm").onsubmit=e=>setLocation(e).catch(handle);
  window.addEventListener("online",()=>{conn("online","Live verbunden");loadBundle(true).catch(handle)});
  window.addEventListener("offline",()=>conn("offline","Browser offline"));
}
async function boot(){
  bind();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
  try{await ensureSession();await loadAccesses()}catch(e){console.error(e);conn("offline","Verbindung fehlgeschlagen");$("join").classList.remove("hidden");$("joinMsg").textContent=human(e)}
}
boot();
