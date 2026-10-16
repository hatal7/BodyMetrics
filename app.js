(()=>{'use strict';
const $=id=>document.getElementById(id);
const FIELDS=['weight','waist','hips','chest','thigh','arm'];
const LABELS={weight:'Masa ciała',waist:'Talia',hips:'Biodra',chest:'Klatka piersiowa',thigh:'Udo',arm:'Ramię'};
const UNITS={weight:'kg',waist:'cm',hips:'cm',chest:'cm',thigh:'cm',arm:'cm'};
const CHARTS={weightChart:'weight',analysisWeight:'weight',analysisWaist:'waist',analysisHips:'hips',analysisChest:'chest',analysisThigh:'thigh',analysisArm:'arm'};
const state={client:null,user:null,records:[],charts:{},tab:'dashboard',range:{dashboard:'all',analysis:'30'},authMode:'login',editing:null,busy:false,loadSeq:0};
function localDate(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function fmtDay(date){if(!date)return '—';const [y,m,d]=date.split('-');return `${d}.${m}.${y}`}
function fmtNum(value,digits=1){return Number(value).toLocaleString('pl-PL',{minimumFractionDigits:digits,maximumFractionDigits:digits})}
function esc(str){return String(str??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
let toastTimeout;function toast(message,error=false){const box=$('toast');box.textContent=message;box.style.color=error?'var(--danger)':'var(--fg)';box.classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>box.classList.add('hidden'),4000)}
function authMessage(msg,error=false){$('authMessage').textContent=msg;$('authMessage').classList.toggle('error',error);$('authMessage').classList.remove('hidden')}
function fromError(error){if(!error)return 'Nieznany błąd';if(/Invalid login credentials/i.test(error.message))return 'Nieprawidłowy login lub hasło.';if(/Email not confirmed/i.test(error.message))return 'Potwierdź adres e-mail, korzystając z linku w wiadomości.';if(/already registered/i.test(error.message))return 'Konto z tym adresem już istnieje.';if(/duplicate key|measurements_user_date_key/i.test(error.message))return 'Masz już pomiar w tym dniu. Otwórz go do edycji w Historii.';if(/fetch|network/i.test(error.message))return 'Nie można połączyć się z serwerem. Sprawdź internet.';return error.message||String(error)}
function onlineState(){$('offlineBanner').classList.toggle('hidden',navigator.onLine)}window.addEventListener('online',()=>{onlineState();if(state.user)loadRecords()});window.addEventListener('offline',onlineState);onlineState();
function initTheme(){let saved='dark';try{saved=localStorage.getItem('bodymetrics-theme')||'dark'}catch{}applyTheme(saved)}
function applyTheme(mode){mode=mode==='light'?'light':'dark';document.documentElement.dataset.theme=mode;document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.textContent=mode==='light'?'☾':'☀');try{localStorage.setItem('bodymetrics-theme',mode)}catch{}renderCharts()}
document.addEventListener('click',e=>{if(e.target.closest('[data-theme-toggle]'))applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')});initTheme();
function ensureConfigured(){const cfg=window.BODYMETRICS_CONFIG||{};if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.url||'')||!cfg.anonKey||/WSTAW|YOUR_|PLACEHOLDER/i.test(cfg.anonKey))return false;if(!window.supabase)return false;state.client=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});return true}
async function init(){if(!ensureConfigured()){authMessage('Aplikacja wymaga ustawienia adresu Supabase i klucza publicznego w pliku config.js oraz uruchomienia database.sql. Instrukcja znajduje się w README.md.',true);$('authSubmit').disabled=true;return}
  $('authSubmit').disabled=false;
  state.client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){showAuth();return}if(session?.user && (!state.user||state.user.id!==session.user.id)){setTimeout(()=>enterApp(session.user),0)}});
  const {data,error}=await state.client.auth.getSession();if(error)authMessage(fromError(error),true);if(data?.session?.user)await enterApp(data.session.user);
}
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.client)return;
  const username=$('username').value.trim().toLowerCase(),password=$('password').value;
  const btn=$('authSubmit');btn.disabled=true;btn.textContent='Logowanie…';authMessage('Łączenie z serwerem logowania…');
  try{
    if(!/^[a-z0-9_]{3,30}$/.test(username))throw new Error('Login musi mieć od 3 do 30 znaków: małe litery, cyfry lub _.');
    const config=window.BODYMETRICS_CONFIG;
    const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/login-by-username',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':config.anonKey},
      body:JSON.stringify({username,password})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(response.status===401?'Nieprawidłowy login lub hasło.':response.status===404?'Nie znaleziono funkcji login-by-username w Supabase.':response.status===429?'Zbyt wiele prób. Spróbuj później.':(payload.error||('Błąd funkcji logowania (HTTP '+response.status+').')));
    if(!payload.access_token||!payload.refresh_token)throw new Error('Serwer nie zwrócił ważnej sesji.');
    const {data,error}=await state.client.auth.setSession({access_token:payload.access_token,refresh_token:payload.refresh_token});
    if(error)throw error;
    if(data.user)await enterApp(data.user);
  }catch(error){console.error('BodyMetrics login:',error);authMessage(fromError(error),true)}finally{btn.disabled=false;btn.textContent='Zaloguj się ↗'}
});
async function enterApp(user){state.user=user;$('auth').classList.add('hidden');$('app').classList.remove('hidden');$('userChip').textContent='Moje konto';$('accountEmail').textContent='Prywatne konto';$('today').textContent=new Date().toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});$('measuredAt').value=localDate();$('quickWeightDate').textContent=fmtDay(localDate());showTab('dashboard');await loadRecords()}
function showAuth(){state.user=null;state.records=[];state.loadSeq++;Object.values(state.charts).forEach(c=>c.destroy());state.charts={};$('app').classList.add('hidden');$('auth').classList.remove('hidden');$('password').value=''}
async function logout(){const {error}=await state.client.auth.signOut();if(error)toast(fromError(error),true);else showAuth()}
document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',logout));
const TITLES={dashboard:'Przegląd pomiarów',add:'Dodaj pomiar',history:'Historia pomiarów',analysis:'Analiza trendów',settings:'Ustawienia'};
function showTab(tab){state.tab=tab;document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===tab));document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('pageTitle').textContent=TITLES[tab];if(tab==='add'&&!state.editing)$('measuredAt').value=localDate();window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(renderCharts)}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
document.querySelectorAll('[data-filter-group]').forEach(group=>group.addEventListener('click',e=>{const button=e.target.closest('[data-range]');if(!button)return;state.range[group.dataset.filterGroup]=button.dataset.range;group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));renderCharts()}));
async function loadRecords(){if(!state.user)return;const seq=++state.loadSeq;const {data,error}=await state.client.from('measurements').select('id,measured_at,weight,waist,hips,chest,thigh,arm,note,created_at').eq('user_id',state.user.id).order('measured_at',{ascending:true}).limit(10000);if(seq!==state.loadSeq||!state.user)return;if(error){toast('Odczyt pomiarów: '+fromError(error),true);return}state.records=data||[];renderAll()}
function rangeRecords(kind){
  const range=state.range[kind];
  if(range==='all')return state.records;
  const today=new Date(),end=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const start=new Date(end);
  if(range==='6m'||range==='1y'){
    // Calendar months/years; clamp end-of-month dates for stable boundaries.
    const count=range==='6m'?6:12;
    const targetMonth=end.getFullYear()*12+end.getMonth()-count;
    const year=Math.floor(targetMonth/12),month=targetMonth-year*12;
    const lastDay=new Date(year,month+1,0).getDate();
    start.setFullYear(year,month,Math.min(end.getDate(),lastDay));
  }else{
    start.setDate(start.getDate()-Number(range)+1);
  }
  const begin=localDate(start),finish=localDate(end);
  return state.records.filter(row=>row.measured_at>=begin&&row.measured_at<=finish);
}
function valuesFor(records,key){return records.filter(r=>r[key]!==null&&r[key]!==undefined).map(r=>({date:r.measured_at,value:Number(r[key])}))}
// Brakujące dni na wykresie masy: wizualnie utrzymuj ostatni pomiar.
// Nie zapisuj wartości zastępczych do bazy i nie uwzględniaj ich w statystykach.
function fillWeightChartDays(actual){
  if(actual.length<2)return actual.map(p=>({...p,carried:false}));
  const byDate=new Map(actual.map(p=>[p.date,p.value]));
  const start=Date.parse(actual[0].date+'T00:00:00Z');
  const end=Date.parse(actual.at(-1).date+'T00:00:00Z');
  const points=[];let previous=null;
  for(let day=start;day<=end;day+=86400000){
    const date=new Date(day).toISOString().slice(0,10);
    const measured=byDate.has(date);
    if(measured)previous=byDate.get(date);
    points.push({date,value:previous,carried:!measured});
  }
  return points;
}
function deltaText(values,unit){if(!values.length)return 'Brak zapisanych wartości w wybranym okresie.';if(values.length===1)return 'Na razie jeden pomiar w wybranym okresie.';const delta=values.at(-1).value-values[0].value;return `Pierwszy pomiar: ${fmtNum(values[0].value)} ${unit} · Ostatni: ${fmtNum(values.at(-1).value)} ${unit} · Zmiana: ${delta>0?'+':''}${fmtNum(delta)} ${unit}`}
function renderAll(){renderCircumferenceChanges();const records=state.records;const weights=valuesFor(records,'weight'),latest=records.at(-1);$('lastWeight').textContent=weights.length?fmtNum(weights.at(-1).value)+' kg':'—';$('lastWeightDate').textContent=weights.length?fmtDay(weights.at(-1).date):'Brak danych';$('weightChange').textContent=weights.length>1?`${weights.at(-1).value-weights[0].value>0?'+':''}${fmtNum(weights.at(-1).value-weights[0].value)} kg`:'—';$('totalEntries').textContent=records.length;$('lastDate').textContent=latest?fmtDay(latest.measured_at).slice(0,5):'—';$('historyCount').textContent=records.length+' wpisów';renderRecent();renderHistory();renderCharts()}
function renderCircumferenceChanges(){
  const el=$('circumferenceChanges');
  el.innerHTML=FIELDS.filter(f=>f!=='weight').map(key=>{
    const vals=valuesFor(state.records,key), last=vals.at(-1), previous=vals.at(-2);
    const diff=last&&previous?Math.round((last.value-previous.value)*10)/10:null;
    const label=diff===null?'Brak poprzedniego pomiaru':`${diff>0?'+':''}${fmtNum(diff)} cm względem poprzedniego`;
    const trend=diff===null||diff===0?'same':diff<0?'down':'up';
    return `<div class="circumference-item"><div class="c-label">${LABELS[key]}</div><div class="c-value">${last?fmtNum(last.value)+' cm':'—'}</div><div class="c-delta ${trend}">${label}</div><div class="hint">${last?fmtDay(last.date):'Brak danych'}</div></div>`;
  }).join('');
}
const quickStatus=$('quickWeightStatus');
function showQuickStatus(message,error=false){
  if(!quickStatus)return;
  quickStatus.textContent=message;
  quickStatus.classList.remove('hidden');
  quickStatus.style.color=error?'var(--danger)':'var(--fg)';
  quickStatus.setAttribute('role',error?'alert':'status');
}
$('quickWeightForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!state.user){showQuickStatus('Sesja wygasła. Zaloguj się ponownie.',true);return}
  if(state.busy)return;
  if(!navigator.onLine){showQuickStatus('Brak połączenia z internetem.',true);return}
  const raw=$('quickWeight').value.trim().replace(',','.');
  const weight=Number(raw),today=localDate();
  if(!raw||!Number.isFinite(weight)||weight<=0||weight>500){showQuickStatus('Wprowadź prawidłową masę ciała w kg.',true);return}
  state.busy=true;
  const button=$('quickWeightSave');button.disabled=true;button.textContent='Zapisywanie…';
  showQuickStatus('Zapisuję pomiar w Supabase…');
  let saved=false;
  try{
    // Wstawienie lub aktualizacja jednego rekordu na dzień.
    // Najpierw odczytujemy konkretny dzień z bazy, a nie z potencjalnie nieaktualnej pamięci aplikacji.
    const found=await state.client.from('measurements')
      .select('id').eq('user_id',state.user.id).eq('measured_at',today).maybeSingle();
    if(found.error)throw found.error;
    let result;
    if(found.data){
      result=await state.client.from('measurements')
        .update({weight}).eq('id',found.data.id).eq('user_id',state.user.id)
        .select('id,weight,measured_at').single();
    }else{
      result=await state.client.from('measurements')
        .insert({user_id:state.user.id,measured_at:today,weight})
        .select('id,weight,measured_at').single();
    }
    if(result.error)throw result.error;
    if(!result.data?.id)throw new Error('Baza nie potwierdziła zapisu.');
    saved=true;
    $('quickWeight').value='';
    showQuickStatus(`Zapisano ${fmtNum(result.data.weight)} kg (${fmtDay(result.data.measured_at)}). Odświeżam wykres…`);
    // Aktualizujemy local state dopiero z danych potwierdzonych przez bazę.
    await loadRecords();
    showQuickStatus(`Zapisano ${fmtNum(result.data.weight)} kg w Supabase. Pomiar jest dostępny w historii.`);
  }catch(error){
    console.error('BodyMetrics: zapis masy ciała',error);
    const message=fromError(error);
    showQuickStatus(saved?'Pomiar zapisany w bazie, ale nie udało się odświeżyć panelu: '+message:'Nie udało się zapisać pomiaru: '+message,true);
  }finally{state.busy=false;button.disabled=false;button.textContent='Zapisz wagę'}
});
function renderRecent(){const records=[...state.records].reverse().slice(0,4);$('recentRecords').innerHTML=records.length?records.map(r=>`<div class="record"><div><strong>${fmtDay(r.measured_at)}</strong><div class="record-sub">${FIELDS.filter(f=>r[f]!=null).map(f=>`${LABELS[f]}: ${fmtNum(r[f])} ${UNITS[f]}`).join(' · ')}</div></div><button type="button" class="btn small secondary" data-edit="${r.id}">Edytuj</button></div>`).join(''):'<div class="empty">Nie ma jeszcze pomiarów. Dodaj pierwszy wpis.</div>'}
function renderHistory(){const records=[...state.records].reverse();$('historyEmpty').classList.toggle('hidden',records.length>0);$('historyBody').innerHTML=records.map(r=>`<tr><td><strong>${fmtDay(r.measured_at)}</strong>${r.note?`<div class="record-sub" title="${esc(r.note)}">📝 Notatka</div>`:''}</td>${FIELDS.map(f=>`<td>${r[f]==null?'—':fmtNum(r[f])}</td>`).join('')}<td><button type="button" class="btn small secondary" data-edit="${r.id}">Edytuj</button><button type="button" class="btn small danger" data-delete="${r.id}">Usuń</button></td></tr>`).join('')}
document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit){editMeasurement(edit.dataset.edit)}else if(del){const record=state.records.find(r=>r.id===del.dataset.delete);if(record)confirmAction('Usunąć pomiar?',`Usunąć wpis z dnia ${fmtDay(record.measured_at)}? Tej operacji nie można cofnąć.`,async()=>{const {error}=await state.client.from('measurements').delete().eq('id',record.id).eq('user_id',state.user.id);if(error)throw error;toast('Pomiar usunięty.');await loadRecords()})}});
function resetForm(){state.editing=null;$('measurementForm').reset();$('measuredAt').value=localDate();$('formTitle').textContent='Nowy pomiar obwodów';$('editWeightField').classList.add('hidden');$('saveMeasurement').textContent='Zapisz pomiar';$('cancelEdit').classList.add('hidden')}
function editMeasurement(id){const r=state.records.find(x=>x.id===id);if(!r)return;state.editing=id;$('editWeightField').classList.remove('hidden');$('measuredAt').value=r.measured_at;FIELDS.forEach(f=>$(f).value=r[f]??'');$('measurementNote').value=r.note||'';$('formTitle').textContent='Edytuj pomiar';$('saveMeasurement').textContent='Zapisz zmiany';$('cancelEdit').classList.remove('hidden');showTab('add')}
$('cancelEdit').addEventListener('click',resetForm);
$('measurementForm').addEventListener('submit',async e=>{e.preventDefault();if(state.busy||!state.user)return;if(!navigator.onLine){toast('Bez internetu nie można zapisać pomiaru.',true);return}const measured_at=$('measuredAt').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(measured_at)){toast('Podaj poprawną datę.',true);return}if(measured_at>localDate()){toast('Data pomiaru nie może być przyszła.',true);return}
  const payload={measured_at};let any=false;
  for(const f of FIELDS.filter(f=>f!=='weight'||state.editing)){
    const raw=$(f).value.trim(),value=raw===''?null:Number(raw);
    if(value!==null&&(!Number.isFinite(value)||value<=0)){toast(`Podaj poprawną wartość pola ${LABELS[f]}.`,true);return}
    if(f!=='weight'&&value!==null)any=true;
    payload[f]=value;
  }
  if(!any&&!state.editing){toast('Wprowadź przynajmniej jeden obwód w cm.',true);return}
  const note=$('measurementNote').value.trim();
  state.busy=true;$('saveMeasurement').disabled=true;
  try{
    let response;
    if(state.editing){payload.note=note||null;response=await state.client.from('measurements').update(payload).eq('id',state.editing).eq('user_id',state.user.id).select('id').single()}
    else{
      const existing=state.records.find(r=>r.measured_at===measured_at);
      if(existing){
        const patch={};for(const f of FIELDS.filter(f=>f!=='weight'))if(payload[f]!==null)patch[f]=payload[f];
        if(note)patch.note=note;
        response=await state.client.from('measurements').update(patch).eq('id',existing.id).eq('user_id',state.user.id).select('id').single();
      }else{response=await state.client.from('measurements').insert({...payload,note:note||null,user_id:state.user.id}).select('id').single()}
    }
    if(response.error)throw response.error;
    toast('Obwody zostały zapisane.');resetForm();await loadRecords();showTab('add');
  }catch(error){toast(fromError(error),true)}finally{state.busy=false;$('saveMeasurement').disabled=false}
});
function confirmAction(title,message,action){const dialog=$('confirmDialog');$('confirmTitle').textContent=title;$('confirmText').textContent=message;const yes=$('confirmYes'),cancel=$('confirmCancel');yes.disabled=false;yes.onclick=async()=>{yes.disabled=true;try{await action();dialog.close()}catch(error){toast(fromError(error),true)}finally{yes.disabled=false}};cancel.onclick=()=>dialog.close();dialog.showModal()}
$('deleteAccountData').addEventListener('click',()=>{if(!state.user)return;confirmAction('Usunąć wszystkie pomiary?',`Wszystkie ${state.records.length} wpisy zostaną trwale usunięte. Konto pozostanie aktywne.`,async()=>{const {error}=await state.client.from('measurements').delete().eq('user_id',state.user.id);if(error)throw error;toast('Pomiary zostały usunięte.');await loadRecords()})});
function chartColor(name){const light=document.documentElement.dataset.theme==='light';return name==='weight'?(light?'#648f26':'#c7f56e'):(light?'#477d95':'#8ad5f3')}
function renderCharts(){if(!state.user||!window.Chart)return;const light=document.documentElement.dataset.theme==='light';const textColor=light?'#647064':'#a4abb9';const gridColor=light?'#dce0d8':'#313741';Object.entries(CHARTS).forEach(([canvasId,key])=>{const isAnalysis=canvasId.startsWith('analysis');if((isAnalysis?'analysis':'dashboard')!==state.tab)return;const canvas=$(canvasId);if(!canvas)return;const actual=valuesFor(rangeRecords(isAnalysis?'analysis':'dashboard'),key),points=key==='weight'?fillWeightChartDays(actual):actual,color=chartColor(key);if(canvasId==='weightChart'){const label=$('dashboardRangeLabel');if(label)label.textContent=({7:'7 dni',30:'30 dni',90:'90 dni','6m':'6 miesięcy','1y':'Rok',all:'Cały okres'})[state.range.dashboard]+' · kg'}const prior=state.charts[canvasId];if(prior){prior.destroy();delete state.charts[canvasId]}
    state.charts[canvasId]=new Chart(canvas,{type:'line',data:{labels:points.map(p=>fmtDay(p.date).slice(0,5)),datasets:[{label:LABELS[key]+' ('+UNITS[key]+')',data:points.map(p=>p.value),borderColor:color,backgroundColor:color+'24',fill:true,tension:.25,spanGaps:false,pointRadius:(ctx)=>points[ctx.dataIndex]?.carried?0:(points.length>35?1.5:3),pointHoverRadius:5,borderWidth:2.4}]},options:{responsive:true,maintainAspectRatio:false,animation:false,locale:'pl-PL',plugins:{legend:{display:false},tooltip:{callbacks:{title(items){return points[items[0].dataIndex]?.date?fmtDay(points[items[0].dataIndex].date):''},label(ctx){return `${LABELS[key]}: ${fmtNum(ctx.parsed.y)} ${UNITS[key]}${points[ctx.dataIndex]?.carried?' (ostatni znany pomiar)':''}`}}}},scales:{x:{ticks:{color:textColor,maxTicksLimit:6,maxRotation:0},grid:{display:false},border:{color:gridColor}},y:{ticks:{color:textColor,maxTicksLimit:6},grid:{color:gridColor},border:{display:false}}}}});if(isAnalysis){const summary=$('summary'+canvasId.slice('analysis'.length));if(summary)summary.textContent=deltaText(actual,UNITS[key])}
  })}
function csvCell(value){const v=String(value??'');return '"'+v.replace(/"/g,'""')+'"'}
$('exportCsv').addEventListener('click',()=>{const headers=['data','masa_kg','talia_cm','biodra_cm','klatka_cm','udo_cm','ramie_cm','notatka'];const rows=state.records.map(r=>[r.measured_at,...FIELDS.map(f=>r[f]),r.note]);const csv='\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`BodyMetrics-pomiary-${localDate()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
window.addEventListener('focus',()=>{if(state.user)loadRecords()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)loadRecords()});
init().catch(error=>{console.error('BodyMetrics init:',error);authMessage('Nie udało się uruchomić logowania: '+fromError(error),true)});
})();
