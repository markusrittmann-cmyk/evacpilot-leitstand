import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js?v=6";

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const $ = (id) => document.getElementById(id);
const state = {
  session:null,userID:null,accesses:[],access:null,bundle:null,channel:null,timer:null,
  hold:null,holdStart:0,lastInviteCode:null,adminTab:"members",entity:null,memberAreaSelection:new Set()
};

const roleNames = {
  administrator:"Administrator", incidentCommander:"Einsatzleitung",
  alarmInitiator:"Alarmauslöser", managerObserver:"Manager / Beobachter",
  fireSafetyOfficer:"Brandschutz", evacuationAssistant:"Evakuierungshelfer",
  firstResponder:"Ersthelfer"
};
const accessRoles = ["administrator","alarmInitiator","incidentCommander","managerObserver"];
const defaults = {
  administrator:["triggerAlarm","respondToAlarm","viewLiveOverview","updateAreaStatus","useQuickActions","postIncidentUpdates","setIncidentLocation","manageIncident","viewHistory","exportReport","addAttachments","editFireProtocol"],
  incidentCommander:["triggerAlarm","respondToAlarm","viewLiveOverview","updateAreaStatus","useQuickActions","postIncidentUpdates","setIncidentLocation","manageIncident","viewHistory","exportReport","addAttachments","editFireProtocol"],
  alarmInitiator:["triggerAlarm","respondToAlarm","viewLiveOverview","viewHistory"],
  managerObserver:["viewLiveOverview","postIncidentUpdates","viewHistory","exportReport"],
  fireSafetyOfficer:["respondToAlarm","viewLiveOverview","updateAreaStatus","viewHistory"],
  evacuationAssistant:["respondToAlarm","viewLiveOverview","updateAreaStatus","viewHistory"],
  firstResponder:["respondToAlarm","viewLiveOverview","viewHistory"]
};
const permissionNames = {
  triggerAlarm:"Alarme auslösen",
  respondToAlarm:"Persönliche Alarmrückmeldung geben",
  viewLiveOverview:"Live-Übersicht anzeigen",
  updateAreaStatus:"Hallen-/Bereichsstatus aktualisieren",
  useQuickActions:"Schnellmeldungen verwenden",
  postIncidentUpdates:"Einsatzmeldungen senden",
  setIncidentLocation:"Einsatzort setzen",
  manageIncident:"Einsatz steuern und Entwarnung senden",
  viewHistory:"Einsatzhistorie anzeigen",
  exportReport:"Einsatzberichte exportieren",
  addAttachments:"Fotos und Dateien hinzufügen",
  editFireProtocol:"Brandprotokoll ausfüllen und bearbeiten"
};
const permissionKeys = Object.keys(permissionNames);
const qualificationNames = {
  fireSafetyOfficer:"Brandschutzbeauftragter",
  evacuationAssistant:"Evakuierungshelfer",
  firstAider:"Ersthelfer"
};
const alarmSounds = {
  siren01:"Klassische Feueralarmsirene",
  siren02:"Schnelle Wechselsirene / Yelp",
  siren03:"Tiefer Industriealarm",
  siren04:"Zweistufiger Evakuierungsalarm",
  siren05:"Elektronischer Warnalarm"
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
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");clearTimeout($("toast")._t);$("toast")._t=setTimeout(()=>$("toast").classList.add("hidden"),3500)}
function conn(mode,text){$("conn").className=`pill ${mode||""}`;$("conn").textContent=text}
function curMember(){return (state.bundle?.memberships||[]).find(m=>same(m.user_id,state.userID)&&m.active&&!m.deleted_at)||null}
function perms(){const m=curMember();return m?(m.permissions?.length?m.permissions:(defaults[m.role]||[])):[]}
function can(p){return curMember()?.role==="administrator"||perms().includes(p)}
function isAdmin(){return curMember()?.role==="administrator"}
function org(){return state.bundle?.organization||null}
function activeAlerts(){return (state.bundle?.alerts||[]).filter(a=>a.state==="active").sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))}
function active(){return activeAlerts()[0]||null}
function areas(){return (org()?.areas||[]).filter(a=>a.isEnabled!==false)}
function sites(){return (org()?.sites||[]).filter(s=>s.isEnabled!==false)}
function points(){return org()?.assemblyPoints||[]}
function area(id){return areas().find(a=>same(a.id,id))}
function site(id){return sites().find(s=>same(s.id,id))}
function point(id){return points().find(p=>same(p.id,id))}
function member(id){return (state.bundle?.memberships||[]).find(m=>same(m.user_id,id))}
function locationOf(a){if(a?.incidentLocation?.latitude) return a.incidentLocation; return [...(a?.eventLog||[])].reverse().find(e=>e.incidentLocation)?.incidentLocation||null}
function activeAdminCount(){return (state.bundle?.memberships||[]).filter(m=>m.active&&!m.deleted_at&&m.role==="administrator").length}

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
  if($("adminDlg")?.open && isAdmin()) renderAdmin();
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
  $("adminOpen").classList.toggle("hidden",!isAdmin());
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
  $("responses").innerHTML=rs.length?rs.map(r=>{const m=member(r.memberID);const s={onSite:"Vor Ort",coming:"Auf dem Weg",onWay:"Auf dem Weg",unavailable:"Nicht verfügbar"}[r.status]||r.status;return `<div class="row"><div><b>${esc(m?.display_name||"Mitarbeiter")}</b><div class="sub">${esc(fmt(r.updatedAt,false))}</div></div><span class="badge">${esc(s)}</span></div>`}).join(""):`<span class="sub">Noch keine Rückmeldungen.</span>`;
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
  $("members").innerHTML=ms.map(m=>{
    const an=(m.area_ids||[]).map(id=>area(id)?.name).filter(Boolean);
    const classes=isAdmin()?"row clickable":"row";
    return `<div class="${classes}" ${isAdmin()?`data-member-edit="${esc(m.user_id)}"`:""}><div><b>${esc(m.display_name||"Mitarbeiter")}</b><div class="sub">${esc(an.length?an.join(", "):"Gesamt / keine Bereichsbeschränkung")}</div></div><span class="badge">${esc(roleNames[m.role]||m.role)}</span></div>`;
  }).join("");
  if(isAdmin()) $("members").querySelectorAll("[data-member-edit]").forEach(el=>el.onclick=()=>openMemberEditor(el.dataset.memberEdit));
}
function renderHistory(){
  const hs=(state.bundle?.alerts||[]).filter(a=>a.state!=="active").sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,12);
  $("history").innerHTML=hs.length?hs.map(a=>{
    const clickable=isAdmin()?" clickable":"";
    const attrs=isAdmin()?` data-history-id="${esc(a.id)}" title="Einsatzbericht und Verlauf öffnen"`:"";
    return `<div class="row${clickable}"${attrs}><div><b>${a.type==="fire"?"Feueralarm":esc(a.type||"Alarm")}</b><div class="sub">${esc(site(a.siteID)?.name||"")}${site(a.siteID)?" · ":""}${esc(fmt(a.createdAt))}</div></div><span class="badge">${a.state==="resolved"?"Beendet":esc(a.state)}</span></div>`;
  }).join(""):`<span class="sub">Noch keine abgeschlossenen Einsätze.</span>`;
  if(isAdmin()) $("history").querySelectorAll("[data-history-id]").forEach(el=>el.onclick=()=>openHistoryReport(el.dataset.historyId));
}
function historyAlert(id){return (state.bundle?.alerts||[]).find(a=>same(a.id,id))||null}
function historyStatus(v){return {onSite:"Vor Ort",coming:"Auf dem Weg",onWay:"Auf dem Weg",unavailable:"Nicht vor Ort",noResponse:"Keine Rückmeldung"}[v]||v||"–"}
function historyYesNo(v){if(v===true||v==="yes")return"Ja";if(v===false||v==="no")return"Nein";return v||"–"}
function historyCondition(v){return {okay:"OK",notOkay:"Nicht OK",notAssessed:"Nicht bewertet"}[v]||v||"–"}
function historyMember(id){return member(id)?.display_name||"–"}
function openHistoryReport(id){
  if(!isAdmin())return;
  const a=historyAlert(id);if(!a)return;
  const areaNames=(a.areaIDs||[]).map(x=>area(x)?.name||x);
  $("historyReportTitle").textContent=a.type==="fire"?"Einsatzbericht · Feueralarm":"Einsatzbericht";
  $("historyReportMeta").textContent=[site(a.siteID)?.name,areaNames.join(", "),fmt(a.createdAt)].filter(Boolean).join(" · ");
  $("historyReportBody").innerHTML=buildHistoryReport(a,areaNames);
  $("historyReportDlg").showModal();
}
function buildHistoryReport(a,areaNames){
  const loc=locationOf(a);
  const responses=[...(a.responses||[])].sort((x,y)=>new Date(x.updatedAt)-new Date(y.updatedAt));
  const progress=[...(a.areaProgress||[])].sort((x,y)=>new Date(x.updatedAt)-new Date(y.updatedAt));
  const events=[...(a.eventLog||[])].sort((x,y)=>new Date(x.timestamp)-new Date(y.timestamp));
  const protocol=a.fireProtocol||null;
  const attachments=a.attachments||[];

  const responseRows=responses.length?responses.map(r=>`<div class="report-row"><span>${esc(historyMember(r.memberID))}</span><b>${esc(historyStatus(r.status))}</b><small>${esc(fmt(r.updatedAt))}</small></div>`).join(""):`<div class="muted-note">Keine Rückmeldungen gespeichert.</div>`;
  const areaRows=progress.length?progress.map(p=>`<div class="report-row"><span>${esc(area(p.areaID)?.name||p.areaID)}</span><b>${esc(statusNames[p.status]||p.status||"–")}</b><small>${esc(historyMember(p.updatedBy))} · ${esc(fmt(p.updatedAt))}</small></div>`).join(""):`<div class="muted-note">Keine Bereichsstatus gespeichert.</div>`;
  const eventRows=events.length?events.map(e=>`<div class="report-event"><div class="report-event-icon">${icons[e.kind]||"•"}</div><div><b>${esc(e.text||e.kind)}</b><div class="sub">${esc(fmt(e.timestamp))}${e.memberID?` · ${esc(historyMember(e.memberID))}`:""}</div></div></div>`).join(""):`<div class="muted-note">Kein Verlauf gespeichert.</div>`;
  const attachmentRows=attachments.length?attachments.map(x=>`<div class="report-row"><span>${esc(x.fileName||"Anlage")}</span><b>${esc(x.kind||"Datei")}</b><small>${esc(fmt(x.createdAt))}</small></div>`).join(""):`<div class="muted-note">Keine Anlagen vorhanden.</div>`;

  return `
    <div class="report-summary-grid">
      <div class="report-kpi"><span>Status</span><b>${a.state==="resolved"?"Beendet":esc(a.state||"–")}</b></div>
      <div class="report-kpi"><span>Beginn</span><b>${esc(fmt(a.createdAt))}</b></div>
      <div class="report-kpi"><span>Beendet</span><b>${esc(fmt(a.resolvedAt))}</b></div>
      <div class="report-kpi"><span>Ausgelöst von</span><b>${esc(historyMember(a.createdBy))}</b></div>
    </div>
    <section class="report-section">
      <h3>Grunddaten</h3>
      <div class="report-facts">
        <div><span>Standort</span><b>${esc(site(a.siteID)?.name||"–")}</b></div>
        <div><span>Bereich</span><b>${esc(areaNames.join(", ")||"–")}</b></div>
        <div><span>Beschreibung</span><b>${esc(a.details||"–")}</b></div>
        <div><span>Rettungskräfte alarmiert</span><b>${a.emergencyServicesCalled?"Ja":"Nein"}</b></div>
        <div><span>Entwarnung durch</span><b>${esc(historyMember(a.resolvedBy))}</b></div>
        <div><span>Einsatzort</span><b>${loc?.latitude?`${Number(loc.latitude).toFixed(6)}, ${Number(loc.longitude).toFixed(6)}`:"–"}</b></div>
      </div>
    </section>
    <section class="report-section"><h3>Rückmeldungen</h3><div class="report-list">${responseRows}</div></section>
    <section class="report-section"><h3>Hallen / Bereiche</h3><div class="report-list">${areaRows}</div></section>
    <section class="report-section"><h3>Einsatzverlauf</h3><div class="report-timeline">${eventRows}</div></section>
    <section class="report-section"><h3>Brandprotokoll / Bericht</h3>${protocol?buildHistoryProtocol(protocol):`<div class="muted-note">Für diesen Einsatz wurde kein Brandprotokoll ausgefüllt.</div>`}</section>
    <section class="report-section"><h3>Anlagen</h3><div class="report-list">${attachmentRows}</div></section>
  `;
}
function buildHistoryProtocol(p){
  const fields=[
    ["Nr.",p.reportNumber],["Unternehmen / Werk",p.plant],["Halle / Bereich",p.area],["Datum / Uhrzeit",p.occurredAt?fmt(p.occurredAt):"–"],
    ["Entstehung / Ursache",p.originOrCause],["Beschreibung / Ablauf",p.descriptionOrSequence],
    ["Personenschaden",historyYesNo(p.personalInjury)],["Verletzte Personen",p.personalInjuryCount??"–"],
    ["Personenrettung",historyYesNo(p.personRescue)],["Gerettete Personen",p.personRescueCount??"–"],
    ["Gebäuderäumung",historyCondition(p.evacuationScope)],["Ablauf",historyCondition(p.evacuationProcess)],["Dauer",p.evacuationDuration],
    ["Baulicher Brandschutz",historyYesNo(p.structuralFireProtection)],["Automatische Feuerlöscheinrichtung",historyYesNo(p.automaticExtinguishing)],
    ["Manuelle Feuerlöscheinrichtungen",historyYesNo(p.manualExtinguishing)],["Brandmeldeanlage vorhanden",historyYesNo(p.fireAlarmSystemPresent)],
    ["Rettungs- und Fluchtwege",historyCondition(p.escapeRoutesCondition)],["Vorbeugender Brandschutz",historyCondition(p.preventiveCondition)],
    ["Protokollersteller",p.author],["Protokolldatum",p.reportDate?fmt(p.reportDate):"–"]
  ];
  return `<div class="report-facts">${fields.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v??"–")}</b></div>`).join("")}</div>`;
}

async function join(e){
  e.preventDefault();$("joinMsg").textContent="";
  const username=$("username").value.trim(), password=$("password").value;
  const r=await sb.rpc("alertline_leitstand_login",{p_username:username,p_password:password});
  if(r.error)throw r.error;
  $("password").value="";toast(`${username} angemeldet.`);await loadAccesses();
}

/* Alarmfunktionen */
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

/* Administration */
function openAdmin(){
  if(!isAdmin())return;
  state.adminTab="members";renderAdmin();$("adminDlg").showModal();
}
function renderAdmin(){
  if(!isAdmin()){if($("adminDlg").open)$("adminDlg").close();return}
  document.querySelectorAll("[data-admin-tab]").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===state.adminTab));
  document.querySelectorAll(".admin-pane").forEach(p=>p.classList.add("hidden"));
  $(`admin-${state.adminTab}`).classList.remove("hidden");
  if(state.adminTab==="members")renderAdminMembers();
  if(state.adminTab==="invites")renderAdminInvites();
  if(state.adminTab==="sites")renderAdminSites();
  if(state.adminTab==="areas")renderAdminAreas();
  if(state.adminTab==="points")renderAdminPoints();
  if(state.adminTab==="system")renderAdminSystem();
}
function switchAdminTab(tab){state.adminTab=tab;renderAdmin()}

function renderAdminMembers(){
  const ms=(state.bundle?.memberships||[]).filter(m=>!m.deleted_at).sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),"de"));
  $("admin-members").innerHTML=`
    <div class="admin-section">
      <div class="admin-toolbar"><div><h3>Mitarbeiter & Rollen</h3><div class="sub">Rolle, Status, Qualifikationen, Berechtigungen sowie Standort- und Hallenzuordnung.</div></div><span class="admin-only-marker">Admin</span></div>
      <div class="admin-list">${ms.map(m=>{
        const siteNames=(m.site_ids||[]).map(id=>site(id)?.name).filter(Boolean);
        const areaNames=(m.area_ids||[]).map(id=>area(id)?.name).filter(Boolean);
        return `<div class="admin-item"><div class="admin-item-main"><b>${esc(m.display_name)}${same(m.user_id,state.userID)?" · DU":""}</b><div class="sub">${esc(roleNames[m.role]||m.role)}${m.active?"":" · Inaktiv"}</div><div class="sub">${esc(siteNames.join(", ")||"Keine Standortzuordnung")}${areaNames.length?` · ${esc(areaNames.join(", "))}`:""}</div></div><div class="admin-item-actions"><button data-edit-member="${esc(m.user_id)}">Bearbeiten</button></div></div>`;
      }).join("")}</div>
    </div>`;
  $("admin-members").querySelectorAll("[data-edit-member]").forEach(b=>b.onclick=()=>openMemberEditor(b.dataset.editMember));
}

function openMemberEditor(id){
  if(!isAdmin())return;
  const m=member(id);if(!m||m.deleted_at)return;
  $("memberID").value=m.user_id;$("memberDlgTitle").textContent=m.display_name||"Mitarbeiter bearbeiten";
  $("memberName").value=m.display_name||"";$("memberEmail").value=m.email||"";
  $("memberRole").innerHTML=accessRoles.map(r=>`<option value="${r}">${esc(roleNames[r])}</option>`).join("");$("memberRole").value=accessRoles.includes(m.role)?m.role:"managerObserver";
  $("memberActive").checked=!!m.active;
  state.memberAreaSelection=new Set(m.area_ids||[]);
  const self=same(m.user_id,state.userID);
  $("memberRole").disabled=self;$("memberActive").disabled=self;$("memberDelete").disabled=self;
  renderMemberQualifications(m);renderMemberPermissions(m);renderMemberSites(m);renderMemberAreas();
  $("memberDlg").showModal();
}
function renderMemberQualifications(m){
  const selected=new Set(m.qualifications||[]);
  $("memberQualifications").innerHTML=Object.entries(qualificationNames).map(([k,v])=>`<label class="checkitem"><input type="checkbox" name="memberQualification" value="${k}" ${selected.has(k)?"checked":""}> ${esc(v)}</label>`).join("");
}
function renderMemberPermissions(m){
  const role=$("memberRole").value, self=same(m.user_id,state.userID), all=role==="administrator"||self;
  const selected=new Set(all?permissionKeys:(m.permissions?.length?m.permissions:(defaults[role]||[])));
  $("memberPermissions").innerHTML=permissionKeys.map(k=>`<label class="checkitem"><input type="checkbox" name="memberPermission" value="${k}" ${selected.has(k)?"checked":""} ${all?"disabled":""}> ${esc(permissionNames[k])}</label>`).join("");
}
function renderMemberSites(m){
  const selected=m.site_ids||[];
  $("memberSites").innerHTML=sites().map(s=>`<label class="checkitem"><input type="checkbox" name="memberSite" value="${esc(s.id)}" ${selected.some(id=>same(id,s.id))?"checked":""}> ${esc(s.name)}</label>`).join("");
  $("memberSites").querySelectorAll('input[name="memberSite"]').forEach(i=>i.onchange=()=>{
    if(!i.checked){
      for(const a of areas().filter(a=>same(a.siteID,i.value))){
        for(const saved of [...state.memberAreaSelection]) if(same(saved,a.id)) state.memberAreaSelection.delete(saved);
      }
    }
    renderMemberAreas();
  });
}
function renderMemberAreas(){
  const selectedSites=[...document.querySelectorAll('input[name="memberSite"]:checked')].map(x=>x.value);
  const eligible=areas().filter(a=>selectedSites.some(id=>same(id,a.siteID)));
  $("memberAreas").innerHTML=eligible.length?eligible.map(a=>`<label class="checkitem"><input type="checkbox" name="memberArea" value="${esc(a.id)}" ${[...state.memberAreaSelection].some(id=>same(id,a.id))?"checked":""}> ${esc(a.name)}</label>`).join(""):`<div class="muted-note">Zuerst mindestens einen Standort auswählen.</div>`;
  $("memberAreas").querySelectorAll('input[name="memberArea"]').forEach(i=>i.onchange=()=>{
    const existing=[...state.memberAreaSelection].find(x=>same(x,i.value));
    if(i.checked){if(!existing)state.memberAreaSelection.add(i.value)}else if(existing)state.memberAreaSelection.delete(existing);
  });
}
function resetPermissionsForRole(){
  const m=member($("memberID").value);if(!m)return;
  const role=$("memberRole").value;
  m.permissions=[...(defaults[role]||[])];renderMemberPermissions(m);
}
async function saveMember(e){
  e.preventDefault();if(!isAdmin())throw new Error("Keine Administratorberechtigung.");
  const id=$("memberID").value,m=member(id);if(!m)throw new Error("Mitarbeiter nicht gefunden.");
  const self=same(id,state.userID);
  let role=self?"administrator":$("memberRole").value, activeFlag=self?true:$("memberActive").checked;
  if(m.role==="administrator"&&m.active&&(role!=="administrator"||!activeFlag)&&activeAdminCount()<=1)throw new Error("Mindestens ein aktiver Administrator muss erhalten bleiben.");
  const selectedSites=[...document.querySelectorAll('input[name="memberSite"]:checked')].map(x=>x.value);
  const allowedAreaIDs=new Set(areas().filter(a=>selectedSites.includes(a.siteID)).map(a=>a.id));
  const selectedAreas=[...state.memberAreaSelection].filter(id=>[...allowedAreaIDs].some(x=>same(x,id)));
  const qualifications=[...document.querySelectorAll('input[name="memberQualification"]:checked')].map(x=>x.value);
  const permissions=(role==="administrator"||self)?permissionKeys:[...document.querySelectorAll('input[name="memberPermission"]:checked')].map(x=>x.value);
  const update={
    display_name:$("memberName").value.trim(),email:$("memberEmail").value.trim(),role,
    qualifications,permissions,site_ids:selectedSites,area_ids:selectedAreas,active:activeFlag
  };
  if(!update.display_name)throw new Error("Name darf nicht leer sein.");
  const r=await sb.from("memberships").update(update).eq("organization_id",state.access.organization_id).eq("user_id",id);if(r.error)throw r.error;
  $("memberDlg").close();toast("Mitarbeiter aktualisiert.");await loadBundle(true);
}
async function deleteMember(){
  if(!isAdmin())return;const id=$("memberID").value,m=member(id);if(!m)return;
  if(same(id,state.userID))throw new Error("Der aktuell angemeldete Administrator kann nicht gelöscht werden.");
  if(m.role==="administrator"&&m.active&&activeAdminCount()<=1)throw new Error("Der letzte aktive Administrator kann nicht gelöscht werden.");
  if(!confirm(`${m.display_name} wirklich löschen? Bestehende Einsatzprotokolle bleiben erhalten.`))return;
  const r=await sb.from("memberships").update({active:false,site_ids:[],area_ids:[],deleted_at:now()}).eq("organization_id",state.access.organization_id).eq("user_id",id);if(r.error)throw r.error;
  $("memberDlg").close();toast("Mitarbeiter gelöscht.");await loadBundle(true);
}

function inviteStatus(i){
  if(i.revoked_at)return ["Widerrufen","gray"];
  if(i.redeemed_at)return ["Verwendet","green"];
  if(new Date(i.expires_at)<new Date())return ["Abgelaufen","orange"];
  return ["Aktiv","green"];
}
function renderAdminInvites(){
  const inv=state.bundle?.inviteStates||[];
  $("admin-invites").innerHTML=`
    <div class="admin-section">
      <div class="admin-toolbar"><div><h3>Neuen Einladungscode erstellen</h3><div class="sub">Wie in der iOS-App: 72 Stunden Standardlaufzeit, ein Mitarbeiter pro Code.</div></div></div>
      <div class="admin-form grid-4">
        <label>Rolle<select id="inviteRole">${accessRoles.map(r=>`<option value="${r}" ${r==="managerObserver"?"selected":""}>${esc(roleNames[r])}</option>`).join("")}</select></label>
        <label>Gültigkeit<select id="inviteHours"><option value="24">24 Stunden</option><option value="72" selected>72 Stunden</option><option value="168">7 Tage</option></select></label>
        <div></div><button id="inviteCreate" class="primary">Code erzeugen</button>
        <div class="editor-section"><h3>Standorte</h3><div id="inviteSites" class="checks">${sites().map(s=>`<label class="checkitem"><input type="checkbox" name="inviteSite" value="${esc(s.id)}"> ${esc(s.name)}</label>`).join("")}</div></div>
        <div class="editor-section"><h3>Hallen / Bereiche</h3><div id="inviteAreas" class="checks"><div class="muted-note">Standort auswählen.</div></div></div>
      </div>
      ${state.lastInviteCode?`<div class="code-box"><div><div class="sub">Neu erzeugter Code</div><code>${esc(state.lastInviteCode)}</code></div><button id="copyInvite">Code kopieren</button></div>`:""}
    </div>
    <div class="admin-section"><h3>Erzeugte Codes</h3><div class="admin-list">${inv.length?inv.map(i=>{const [s,c]=inviteStatus(i);return `<div class="admin-item"><div class="admin-item-main"><b>${esc(roleNames[i.role]||i.role)} · ${esc(String(i.id).slice(0,8))}</b><div class="sub">Erstellt ${esc(fmt(i.created_at))} · gültig bis ${esc(fmt(i.expires_at))}</div></div><div class="admin-item-actions"><span class="badge ${c}">${s}</span>${s==="Aktiv"?`<button data-revoke-invite="${esc(i.id)}">Widerrufen</button>`:""}</div></div>`}).join(""):`<div class="muted-note">Noch keine Einladungscodes.</div>`}</div></div>`;
  $("inviteSites").querySelectorAll('input[name="inviteSite"]').forEach(i=>i.onchange=renderInviteAreas);
  $("inviteCreate").onclick=()=>createInvite().catch(handle);
  $("copyInvite")?.addEventListener("click",()=>navigator.clipboard.writeText(state.lastInviteCode).then(()=>toast("Code kopiert.")));
  $("admin-invites").querySelectorAll("[data-revoke-invite]").forEach(b=>b.onclick=()=>revokeInvite(b.dataset.revokeInvite).catch(handle));
}
function renderInviteAreas(){
  const selected=new Set([...document.querySelectorAll('input[name="inviteSite"]:checked')].map(x=>x.value));
  const list=areas().filter(a=>selected.has(a.siteID));
  $("inviteAreas").innerHTML=list.length?list.map(a=>`<label class="checkitem"><input type="checkbox" name="inviteArea" value="${esc(a.id)}"> ${esc(a.name)}</label>`).join(""):`<div class="muted-note">Standort auswählen.</div>`;
}
function generateInviteCode(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let raw="";const bytes=crypto.getRandomValues(new Uint8Array(8));for(let i=0;i<8;i++)raw+=alphabet[bytes[i]%alphabet.length];return `${raw.slice(0,4)}-${raw.slice(4)}`;
}
async function createInvite(){
  const siteIDs=[...document.querySelectorAll('input[name="inviteSite"]:checked')].map(x=>x.value);
  const areaIDs=[...document.querySelectorAll('input[name="inviteArea"]:checked')].map(x=>x.value);
  const code=generateInviteCode(), id=uuid(), role=$("inviteRole").value, hours=Number($("inviteHours").value||72);
  const r=await sb.rpc("alertline_create_invite_v2",{org:state.access.organization_id,invite_id:id,invite_code:code,invite_role:role,invite_site_ids:siteIDs,invite_area_ids:areaIDs,valid_hours:hours});if(r.error)throw r.error;
  state.lastInviteCode=code;toast("Einladungscode erstellt.");await loadBundle(true);state.adminTab="invites";renderAdmin();
}
async function revokeInvite(id){
  if(!confirm("Diesen Einladungscode widerrufen?"))return;
  const r=await sb.rpc("alertline_revoke_invite",{org:state.access.organization_id,invite_id:id});if(r.error)throw r.error;toast("Einladung widerrufen.");await loadBundle(true);
}

function renderAdminSites(){
  const list=sites();
  $("admin-sites").innerHTML=`<div class="admin-section"><div class="admin-toolbar"><div><h3>Werke & Standorte</h3><div class="sub">Ebene oberhalb von Hallen und Bereichen.</div></div><button class="primary" id="addSite">Standort hinzufügen</button></div><div class="admin-list">${list.map(s=>`<div class="admin-item"><div class="admin-item-main"><b>${esc(s.name)}</b><div class="sub">${esc(s.details||"")}${s.details?" · ":""}${areas().filter(a=>same(a.siteID,s.id)).length} Hallen / Bereiche</div></div><div class="admin-item-actions"><button data-edit-site="${esc(s.id)}">Bearbeiten</button></div></div>`).join("")}</div></div>`;
  $("addSite").onclick=()=>openEntityEditor("site",null);$("admin-sites").querySelectorAll("[data-edit-site]").forEach(b=>b.onclick=()=>openEntityEditor("site",b.dataset.editSite));
}
function renderAdminAreas(){
  $("admin-areas").innerHTML=`<div class="admin-section"><div class="admin-toolbar"><div><h3>Hallen & Bereiche</h3><div class="sub">Zuordnung zu Werk und Sammelpunkt.</div></div><button class="primary" id="addArea">Bereich hinzufügen</button></div><div class="admin-list">${areas().map(a=>`<div class="admin-item"><div class="admin-item-main"><b>${esc(a.name)}</b><div class="sub">${esc(site(a.siteID)?.name||"Kein Standort")}${a.assemblyPointID?` · Sammelpunkt: ${esc(point(a.assemblyPointID)?.name||"–")}`:""}${a.details?` · ${esc(a.details)}`:""}</div></div><div class="admin-item-actions"><button data-edit-area="${esc(a.id)}">Bearbeiten</button></div></div>`).join("")}</div></div>`;
  $("addArea").onclick=()=>openEntityEditor("area",null);$("admin-areas").querySelectorAll("[data-edit-area]").forEach(b=>b.onclick=()=>openEntityEditor("area",b.dataset.editArea));
}
function renderAdminPoints(){
  $("admin-points").innerHTML=`<div class="admin-section"><div class="admin-toolbar"><div><h3>Sammelpunkte</h3><div class="sub">Sammelpunkte werden den Hallen und Bereichen zugeordnet.</div></div><button class="primary" id="addPoint">Sammelpunkt hinzufügen</button></div><div class="admin-list">${points().map(p=>`<div class="admin-item"><div class="admin-item-main"><b>${esc(p.name)}</b><div class="sub">${esc(site(p.siteID)?.name||"Kein Standort")}${p.details?` · ${esc(p.details)}`:""}</div></div><div class="admin-item-actions"><button data-edit-point="${esc(p.id)}">Bearbeiten</button></div></div>`).join("")}</div></div>`;
  $("addPoint").onclick=()=>openEntityEditor("point",null);$("admin-points").querySelectorAll("[data-edit-point]").forEach(b=>b.onclick=()=>openEntityEditor("point",b.dataset.editPoint));
}
function openEntityEditor(kind,id){
  if(!isAdmin())return;state.entity={kind,id};$("entityKind").value=kind;$("entityID").value=id||"";
  let item=null,title="";
  if(kind==="site"){item=id?(org()?.sites||[]).find(x=>same(x.id,id)):null;title=item?"Standort bearbeiten":"Standort hinzufügen"}
  if(kind==="area"){item=id?(org()?.areas||[]).find(x=>same(x.id,id)):null;title=item?"Bereich bearbeiten":"Bereich hinzufügen"}
  if(kind==="point"){item=id?points().find(x=>same(x.id,id)):null;title=item?"Sammelpunkt bearbeiten":"Sammelpunkt hinzufügen"}
  $("entityTitle").textContent=title;$("entityName").value=item?.name||"";$("entityDetails").value=item?.details||"";
  $("entityDelete").classList.toggle("hidden",!id);
  const needsSite=kind!=="site";$("entitySiteWrap").classList.toggle("hidden",!needsSite);$("entityPointWrap").classList.toggle("hidden",kind!=="area");
  if(needsSite){$("entitySite").innerHTML=sites().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");$("entitySite").value=item?.siteID||sites()[0]?.id||""}
  if(kind==="area"){renderEntityPointOptions(item?.assemblyPointID||"");$("entitySite").onchange=()=>renderEntityPointOptions("")}
  $("entityDlg").showModal();
}
function renderEntityPointOptions(selected){
  const sid=$("entitySite").value, list=points().filter(p=>same(p.siteID,sid));
  $("entityPoint").innerHTML=`<option value="">Kein Sammelpunkt</option>${list.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}`;$("entityPoint").value=selected||"";
}
async function saveEntity(e){
  e.preventDefault();if(!isAdmin())throw new Error("Keine Administratorberechtigung.");
  const kind=$("entityKind").value,id=$("entityID").value||null,name=$("entityName").value.trim(),details=$("entityDetails").value.trim();if(!name)throw new Error("Name darf nicht leer sein.");
  const doc=structuredClone(org());doc.sites=doc.sites||[];doc.areas=doc.areas||[];doc.assemblyPoints=doc.assemblyPoints||[];
  if(kind==="site"){
    if(id){const x=doc.sites.find(x=>same(x.id,id));if(x){x.name=name;x.details=details}}
    else doc.sites.push({id:uuid(),name,details,isEnabled:true});
  }
  if(kind==="area"){
    const siteID=$("entitySite").value, assemblyPointID=$("entityPoint").value||null;if(!siteID)throw new Error("Standort auswählen.");
    if(id){const x=doc.areas.find(x=>same(x.id,id));if(x){x.name=name;x.details=details;x.siteID=siteID;x.assemblyPointID=assemblyPointID}}
    else doc.areas.push({id:uuid(),name,details,siteID,assemblyPointID,isEnabled:true});
  }
  if(kind==="point"){
    const siteID=$("entitySite").value;if(!siteID)throw new Error("Standort auswählen.");
    if(id){const x=doc.assemblyPoints.find(x=>same(x.id,id));if(x){x.name=name;x.details=details;x.siteID=siteID;for(const a of doc.areas){if(same(a.assemblyPointID,id)&&!same(a.siteID,siteID))a.assemblyPointID=null}}}
    else doc.assemblyPoints.push({id:uuid(),name,details,siteID});
  }
  await saveOrganization(doc);$("entityDlg").close();toast("Konfiguration gespeichert.");await loadBundle(true);
}
async function deleteEntity(){
  if(!isAdmin())return;const kind=$("entityKind").value,id=$("entityID").value;if(!id)return;
  const doc=structuredClone(org());doc.sites=doc.sites||[];doc.areas=doc.areas||[];doc.assemblyPoints=doc.assemblyPoints||[];
  if(kind==="site"){
    const enabled=doc.sites.filter(s=>s.isEnabled!==false);if(enabled.length<=1)throw new Error("Mindestens ein Standort muss erhalten bleiben.");
    if(doc.areas.some(a=>a.isEnabled!==false&&same(a.siteID,id))||doc.assemblyPoints.some(p=>same(p.siteID,id)))throw new Error("Zuerst alle Hallen, Bereiche und Sammelpunkte dieses Standorts verschieben oder löschen.");
    if((state.bundle?.alerts||[]).some(a=>same(a.siteID,id))){const s=doc.sites.find(x=>same(x.id,id));if(s)s.isEnabled=false}else doc.sites=doc.sites.filter(x=>!same(x.id,id));
  }
  if(kind==="area"){
    if(activeAlerts().some(a=>(a.areaIDs||[]).some(x=>same(x,id))))throw new Error("Der Bereich ist Teil eines aktiven Einsatzes und kann nicht gelöscht werden.");
    if((state.bundle?.alerts||[]).some(a=>(a.areaIDs||[]).some(x=>same(x,id)))){const a=doc.areas.find(x=>same(x.id,id));if(a)a.isEnabled=false}else doc.areas=doc.areas.filter(x=>!same(x.id,id));
  }
  if(kind==="point"){
    doc.assemblyPoints=doc.assemblyPoints.filter(x=>!same(x.id,id));for(const a of doc.areas){if(same(a.assemblyPointID,id))a.assemblyPointID=null}
  }
  if(!confirm("Diesen Eintrag wirklich löschen?"))return;
  await saveOrganization(doc);$("entityDlg").close();toast("Eintrag gelöscht.");await loadBundle(true);
}
async function saveOrganization(doc){
  const r=await sb.from("organization_documents").update({document:doc,updated_by:state.userID,updated_at:now()}).eq("organization_id",state.access.organization_id);if(r.error)throw r.error;
}
function renderAdminSystem(){
  const activeCount=(state.bundle?.memberships||[]).filter(m=>m.active&&!m.deleted_at).length;
  const limit=state.access?.member_limit??"–";
  const sound=org()?.alarmSound||"siren01";
  $("admin-system").innerHTML=`
    <div class="admin-section"><h3>Alarmton</h3><div class="admin-form grid-3"><label>Firmenweiter Alarmton<select id="adminSound">${Object.entries(alarmSounds).map(([k,v])=>`<option value="${k}" ${k===sound?"selected":""}>${esc(v)}</option>`).join("")}</select></label><button id="previewSound">Vorschau abspielen</button><button id="saveSound" class="primary">Alarmton speichern</button></div><div class="muted-note">Auswahl und Vorschau entsprechen den Sirenen der iOS-App. Kritische iOS-Warnungen selbst bleiben eine Gerätefunktion.</div></div>
    <div class="admin-section"><h3>Lizenzstatus</h3><div class="license-grid"><div class="license-card"><span>Lizenz</span><b>${state.access?.contract_license_active?"Vertrag aktiv":state.access?.internal_license_active?"Interne Lizenz":"Aktiv"}</b></div><div class="license-card"><span>Mitarbeiterplätze</span><b>${activeCount} / ${esc(limit)}</b></div><div class="license-card"><span>Gültig bis</span><b>${esc(state.access?.contract_valid_until||"–")}</b></div></div><div class="muted-note">StoreKit-Käufe und iOS-Benachrichtigungsfreigaben sind gerätegebunden und werden weiterhin auf dem iPhone verwaltet.</div></div>`;
  $("saveSound").onclick=()=>saveAlarmSound().catch(handle);
  $("previewSound").onclick=()=>previewAlarmSound().catch(handle);
}
let previewAudio=null;
async function previewAlarmSound(){
  if(previewAudio){previewAudio.pause();previewAudio=null}
  const sound=$("adminSound").value;previewAudio=new Audio(`./alertline_siren_${sound.slice(-2)}.wav?v=6`);
  await previewAudio.play();
}
async function saveAlarmSound(){const doc=structuredClone(org());doc.alarmSound=$("adminSound").value;await saveOrganization(doc);toast("Alarmton gespeichert.");await loadBundle(true)}

async function switchOrg(e){state.access=state.accesses.find(x=>same(x.organization_id,e.target.value));localStorage.setItem("evacpilot_web_org",state.access.organization_id);await loadBundle()}
async function logout(){if(state.channel)await sb.removeChannel(state.channel);await sb.auth.signOut({scope:"local"});localStorage.removeItem("evacpilot_web_org");location.reload()}
function human(e){const m=String(e?.message||e||"");if(/invalid credentials/i.test(m))return"Benutzername oder Passwort ist falsch.";if(/browser session already belongs/i.test(m))return"Dieser Browser ist bereits einem anderen EvacPilot-Benutzer zugeordnet.";if(/not authorized|permission denied|row-level security/i.test(m))return"Keine Administratorberechtigung für diese Aktion.";if(/subscription member limit reached/i.test(m))return"Das Mitarbeiterlimit der Lizenz ist erreicht.";if(/network|fetch/i.test(m))return"Verbindung zum Backend fehlgeschlagen.";return m||"Unbekannter Fehler."}
function handle(e){console.error(e);toast(human(e))}

function bind(){
  $("joinForm").onsubmit=e=>join(e).catch(err=>{$("joinMsg").textContent=human(err)});
  $("refresh").onclick=()=>loadBundle().catch(handle);$("orgSelect").onchange=e=>switchOrg(e).catch(handle);$("logout").onclick=()=>logout().catch(handle);
  $("alarmOpen").onclick=()=>{fillAlarm();$("alarmDlg").showModal()};$("alarmClose").onclick=$("alarmCancel").onclick=()=>$("alarmDlg").close();$("alarmForm").onsubmit=e=>createAlarm(e).catch(handle);
  document.querySelectorAll(".quick button").forEach(b=>b.onclick=()=>quick(b.dataset.kind,b.dataset.text).catch(handle));$("updateForm").onsubmit=e=>postUpdate(e).catch(handle);$("falseAlarm").onclick=()=>falseAlarm().catch(handle);
  $("allClear").onpointerdown=startHold;$("allClear").onpointerup=stopHold;$("allClear").onpointerleave=stopHold;$("allClear").onpointercancel=stopHold;
  $("setLoc").onclick=()=>$("locDlg").showModal();$("locClose").onclick=$("locCancel").onclick=()=>$("locDlg").close();$("locForm").onsubmit=e=>setLocation(e).catch(handle);
  $("adminOpen").onclick=openAdmin;$("adminClose").onclick=()=>$("adminDlg").close();document.querySelectorAll("[data-admin-tab]").forEach(b=>b.onclick=()=>switchAdminTab(b.dataset.adminTab));
  $("memberClose").onclick=$("memberCancel").onclick=()=>$("memberDlg").close();$("memberForm").onsubmit=e=>saveMember(e).catch(handle);$("memberDelete").onclick=()=>deleteMember().catch(handle);$("memberRole").onchange=resetPermissionsForRole;
  $("entityClose").onclick=$("entityCancel").onclick=()=>$("entityDlg").close();$("entityForm").onsubmit=e=>saveEntity(e).catch(handle);$("entityDelete").onclick=()=>deleteEntity().catch(handle);
  window.addEventListener("online",()=>{conn("online","Live verbunden");loadBundle(true).catch(handle)});window.addEventListener("offline",()=>conn("offline","Browser offline"));
}
async function boot(){
  bind();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js?v=6").catch(console.warn);
  try{await ensureSession();await loadAccesses()}catch(e){console.error(e);conn("offline","Verbindung fehlgeschlagen");$("join").classList.remove("hidden");$("joinMsg").textContent=human(e)}
}
boot();
