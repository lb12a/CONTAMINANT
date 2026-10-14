// Stream overlay for official broadcasts (OBS browser source): delayed VP race, round, names and the last events.

export function overlayHtml(matchId: string): string {
  const id = JSON.stringify(matchId);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Contaminant Broadcast</title>
<style>
  html,body{margin:0;background:transparent;font-family:"Special Elite","Courier New",monospace;color:#E8DFC8}
  .bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);width:820px;background:rgba(14,10,18,.88);border:2px solid #D9A93A;border-radius:10px;padding:10px 16px;box-shadow:0 6px 24px #000}
  .row{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .name{font-size:22px;letter-spacing:1px}.vp{font-size:30px;color:#D9A93A}
  .race{position:relative;height:14px;background:#1F2A22;border-radius:7px;margin-top:8px;overflow:hidden}
  .l{position:absolute;left:0;top:0;bottom:0;background:#8CFF5A}.r{position:absolute;right:0;top:0;bottom:0;background:#8B1A1F}
  .meta{text-align:center;font-size:13px;opacity:.8;margin-top:6px}
  .log{position:fixed;right:12px;bottom:12px;width:360px;background:rgba(14,10,18,.85);border:1px solid #6B3FA0;border-radius:8px;padding:8px 10px;font-size:13px;line-height:1.35}
  .log div{border-bottom:1px dashed #3a2f48;padding:2px 0}
</style></head>
<body>
<div class="bar"><div class="row"><span class="name" id="n0">—</span><span class="vp" id="v0">0</span><span>VP RACE · 100</span><span class="vp" id="v1">0</span><span class="name" id="n1">—</span></div>
<div class="race"><div class="l" id="l"></div><div class="r" id="r"></div></div>
<div class="meta" id="meta">Waiting for the broadcast feed…</div></div>
<div class="log" id="log"></div>
<script>
const match=${id};
const proto=location.protocol==='https:'?'wss':'ws';
function connect(){
  const ws=new WebSocket(proto+'://'+location.host+'/ws');
  ws.onopen=()=>ws.send(JSON.stringify({t:'spectate',match,caster:true}));
  ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.t!=='spectate_frame')return;
    const p=m.view.players;document.getElementById('n0').textContent=m.names[0];document.getElementById('n1').textContent=m.names[1];
    document.getElementById('v0').textContent=p[0].vp;document.getElementById('v1').textContent=p[1].vp;
    document.getElementById('l').style.width=Math.min(50,p[0].vp/2)+'%';document.getElementById('r').style.width=Math.min(50,p[1].vp/2)+'%';
    document.getElementById('meta').textContent='Round '+m.round+' · broadcast delay '+m.delayRounds+' round(s)'+(m.view.winner!==null?' · FINAL':'');
    const log=document.getElementById('log');log.innerHTML='';
    m.events.filter(x=>['ko','vp','crit','deploy','win'].includes(x.kind)).slice(-8).forEach(x=>{const d=document.createElement('div');d.textContent=x.text;log.appendChild(d);});
  };
  ws.onclose=()=>setTimeout(connect,3000);
}
connect();
</script></body></html>`;
}
