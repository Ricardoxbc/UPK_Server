// Estilos del sitio público (presentación y manual). Servidos en /site/site.css.
export const SITE_STYLESHEET = `
:root{--ink:#0d1526;--ink2:#334155;--mut:#64748b;--bg:#f6f8fc;--card:#fff;--bd:#e2e8f0;--pri:#228be6;--pri2:#1c6fd1;
--pri-soft:#e7f1fd;--acc:#00c853;--glow:#00ff6a;--warn:#f59f00;--err:#e03131;--navy:#0b1426;--navy2:#13264a;
--radius:14px;--shadow:0 10px 30px rgba(13,21,38,.08),0 2px 6px rgba(13,21,38,.05);
--font:"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.6 var(--font);color:var(--ink);background:var(--bg)}
a{color:var(--pri)}img{display:block}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;font-weight:650;text-decoration:none;
border:1px solid transparent;transition:transform .15s,box-shadow .15s,background .15s}
.btn:hover{transform:translateY(-1px)}
.btn.pri{background:var(--pri);color:#fff;box-shadow:0 8px 24px rgba(34,139,230,.35)}.btn.pri:hover{background:var(--pri2)}
.btn.ghost{color:#fff;border-color:rgba(255,255,255,.35)}.btn.ghost:hover{background:rgba(255,255,255,.08)}
.btn.line{color:var(--pri);border-color:var(--pri)}.btn.line:hover{background:var(--pri-soft)}

/* ---------- Barra superior ---------- */
.top{position:sticky;top:0;z-index:30;backdrop-filter:saturate(1.4) blur(10px);background:rgba(11,20,38,.72);border-bottom:1px solid rgba(255,255,255,.08)}
.top .wrap{display:flex;align-items:center;gap:22px;height:62px}
.logo{display:flex;align-items:center;gap:10px;color:#fff;font-weight:750;font-size:18px;text-decoration:none;letter-spacing:.02em}
.logo i{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#2a8ae0,#5b5bf0);display:grid;place-items:center;
font-style:normal;font-size:12px;box-shadow:0 4px 14px rgba(42,138,224,.5)}
.top nav{display:flex;gap:4px;margin-left:auto}.top nav a{color:#cbd5e1;text-decoration:none;padding:7px 12px;border-radius:8px;font-size:15px}
.top nav a:hover{color:#fff;background:rgba(255,255,255,.07)}
.top .btn{padding:8px 16px;font-size:14px}

/* ---------- Portada ---------- */
.hero{position:relative;overflow:hidden;color:#fff;background:radial-gradient(1200px 500px at 85% -10%,#1d4f9c 0,transparent 60%),
radial-gradient(900px 500px at -10% 110%,#0f3b6e 0,transparent 55%),linear-gradient(180deg,var(--navy),var(--navy2));margin-top:-62px;padding:132px 0 90px}
.hero::after{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.08) 1px,transparent 1px);
background-size:26px 26px;mask-image:linear-gradient(180deg,#000,transparent 85%);pointer-events:none}
.hero .wrap{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1.15fr;gap:56px;align-items:center}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;
color:#9cc9ff;background:rgba(34,139,230,.14);border:1px solid rgba(34,139,230,.35);padding:5px 12px;border-radius:999px}
.eyebrow b{width:7px;height:7px;border-radius:50%;background:var(--glow);box-shadow:0 0 10px var(--glow)}
.hero h1{font-size:clamp(36px,4.6vw,58px);line-height:1.05;margin:18px 0 18px;letter-spacing:-.025em}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,#4dabf7,#00e676);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.lead{font-size:19px;color:#c3d0e3;max-width:520px;margin:0 0 30px}
.hero .ctas{display:flex;gap:12px;flex-wrap:wrap}
.hero .facts{display:flex;gap:28px;margin-top:38px;color:#9fb0c8;font-size:14px}.hero .facts b{display:block;color:#fff;font-size:22px}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.pill{font-size:13px;padding:4px 11px;border-radius:999px;background:var(--pri-soft);color:var(--pri2);font-weight:600}

/* ---------- Secciones de módulos ---------- */
.feature{padding:110px 0;border-bottom:1px solid var(--bd)}
.feature:nth-of-type(even){background:#fff}
.feature .wrap{display:grid;grid-template-columns:.9fr 1.1fr;gap:64px;align-items:center}
.feature.flip .wrap{grid-template-columns:1.1fr .9fr}.feature.flip .copy{order:2}
.hero .wrap>*,.feature .wrap>*{min-width:0}
.feature .kicker{display:flex;align-items:center;gap:10px;color:var(--pri);font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:.08em}
.feature .kicker img{width:36px;height:36px}
.feature h2{font-size:clamp(28px,3.2vw,40px);line-height:1.12;margin:14px 0 14px;letter-spacing:-.02em}
.feature p{color:var(--ink2);font-size:17px;margin:0 0 20px}
.checks{list-style:none;padding:0;margin:0 0 24px;display:grid;gap:10px}
.checks li{position:relative;padding-left:32px;color:var(--ink2)}
.checks li::before{content:"";position:absolute;left:0;top:3px;width:20px;height:20px;border-radius:50%;
background:var(--pri-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5 10.5l3.2 3L15 6.5' fill='none' stroke='%23228be6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/14px no-repeat}
.cta-final{padding:100px 0;text-align:center;color:#fff;background:linear-gradient(135deg,#0d2a57,#123d7a 50%,#0b6b5a)}
.cta-final h2{font-size:clamp(28px,3.4vw,42px);margin:0 0 12px;letter-spacing:-.02em}.cta-final p{color:#c3d6ee;font-size:18px;margin:0 0 28px}
footer.foot{padding:28px 0;color:var(--mut);font-size:14px;background:#fff}
footer.foot .wrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap}footer.foot nav{margin-left:auto;display:flex;gap:16px}

/* ---------- "Video": ventana simulada de UPK ---------- */
.player{position:relative;border-radius:16px;padding:10px;background:linear-gradient(160deg,#dde6f3,#c9d6ea);box-shadow:0 30px 60px rgba(13,21,38,.22)}
.hero .player{background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.05));box-shadow:0 40px 80px rgba(0,0,0,.45);
border:1px solid rgba(255,255,255,.14)}
.player .badge{position:absolute;top:-12px;right:18px;z-index:5;background:var(--ink);color:#fff;font-size:12px;font-weight:650;padding:4px 10px;border-radius:999px;
display:flex;gap:6px;align-items:center}.player .badge b{width:7px;height:7px;border-radius:50%;background:#ff4d4f;animation:rec 1.2s infinite}
@keyframes rec{50%{opacity:.25}}
.screen{position:relative;overflow:hidden;border-radius:9px;background:#f2f2f2;font:12px/1.35 "Segoe UI",system-ui,sans-serif;color:#111;
aspect-ratio:16/10.4;user-select:none}
.win-bar{height:26px;background:#fff;display:flex;align-items:center;padding:0 8px;gap:8px;border-bottom:1px solid #e3e3e3;font-size:12px}
.win-bar .dots{margin-left:auto;display:flex;gap:12px;color:#666;font-size:11px}
.toolbar{height:44px;background:#fff;display:flex;align-items:center;gap:2px;padding:0 6px;border-bottom:1px solid #e6e6e6}
.toolbar img{width:34px;height:34px;padding:2px;border-radius:5px}.toolbar img.on{background:#cbcbcb}
.status{position:absolute;left:0;right:0;bottom:0;height:18px;background:#f2f2f2;border-top:1px solid #e2e2e2;font-size:11px;padding:1px 6px;color:#333}
.desk{position:absolute;inset:70px 0 18px 0;background:linear-gradient(120deg,#fafafa,#ececec)}
.frame{position:absolute;inset:6px;background:#f2f2f2;border:1px solid #cfcfcf;display:flex;flex-direction:column}
.frame-title{height:20px;background:#fff;border-bottom:1px solid #ddd;font-size:11px;display:flex;align-items:center;padding:0 6px}
.row-f{display:flex;gap:6px}
.fld{height:18px;border:1px solid #c2c2c2;border-radius:4px;background:#fff;font-size:11px;padding:1px 5px;white-space:nowrap;overflow:hidden;transition:box-shadow .2s,border-color .2s}
.fld.focus{border-color:#89b0d9;box-shadow:0 0 0 2px #c6dcf3}
.fld .caret{display:inline-block;width:1px;height:11px;background:#111;vertical-align:-2px;animation:caret 1s steps(1) infinite}
@keyframes caret{50%{opacity:0}}
.sk{height:8px;border-radius:4px;background:linear-gradient(90deg,#e1e4ea 25%,#eef0f4 37%,#e1e4ea 63%);background-size:400% 100%;animation:sk 1.6s ease infinite}
@keyframes sk{0%{background-position:100% 50%}100%{background-position:0 50%}}
.ubtn{height:20px;border:1px solid #c2c2c2;border-radius:5px;background:#fff;font-size:11px;padding:0 9px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;transition:transform .12s,background .12s}
.ubtn.blue{background:#228be6;border-color:#228be6;color:#fff;font-weight:700}
.ubtn.press{transform:scale(.92);background:#e6e6e6}.ubtn.blue.press{background:#1971c2}
.tbl{background:#fff;border:1px solid #c2c2c2;overflow:hidden;font-size:10.5px}
.tbl .th,.tbl .tr{display:grid;align-items:center;padding:0 4px;height:19px;border-bottom:1px solid #ececec;white-space:nowrap}
.tbl .th{color:#333}.tbl .tr:nth-child(even){background:#f5f5f5}
.tbl .tr.sel{background:#3399ff!important;color:#fff}.tbl .tr.red{background:#ff8c8c}.tbl .tr.yel{background:#ffff8c}
.tbl .tr.new{animation:rowIn .45s cubic-bezier(.2,1.4,.4,1)}
@keyframes rowIn{from{transform:translateX(-30px) scale(.96);opacity:0}}
.dark{background:#666;color:#fff;font-weight:700;position:relative}
.green{color:#00ff00;font-family:Consolas,"Courier New",monospace}
.pop{position:absolute;z-index:4;background:#f2f2f2;border:1px solid #8a8a8a;box-shadow:0 14px 34px rgba(0,0,0,.3);transform-origin:50% 40%;
animation:popIn .35s cubic-bezier(.2,1.5,.4,1)}
@keyframes popIn{from{transform:scale(.7);opacity:0}}
.toast{position:absolute;z-index:6;left:50%;top:44%;transform:translate(-50%,-50%);background:#0d1526;color:#fff;font-weight:700;font-size:14px;
padding:10px 18px;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center;animation:toast 1.8s ease forwards}
.toast i{font-style:normal;color:var(--glow)}
@keyframes toast{0%{transform:translate(-50%,-30%) scale(.6);opacity:0}15%{transform:translate(-50%,-50%) scale(1.08);opacity:1}25%{transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}
.flash{animation:flash .9s ease}@keyframes flash{0%,100%{background:transparent}30%{background:#fff3bf}}
.bump{animation:bump .45s cubic-bezier(.2,1.6,.4,1)}@keyframes bump{40%{transform:scale(1.18)}}
.cursor{position:absolute;z-index:9;left:0;top:0;width:20px;height:20px;pointer-events:none;transition:transform .55s cubic-bezier(.45,.05,.2,1);
filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
.ripple{position:absolute;z-index:8;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #228be6;pointer-events:none;animation:ripple .5s ease-out forwards}
@keyframes ripple{from{transform:scale(.2);opacity:1}to{transform:scale(1.4);opacity:0}}
.confetti{position:absolute;z-index:7;width:7px;height:10px;border-radius:2px;pointer-events:none;animation:conf 1.1s ease-out forwards}
@keyframes conf{to{transform:translate(var(--dx),var(--dy)) rotate(540deg);opacity:0}}
.bar{height:8px;border-radius:99px;background:#e2e2e2;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#f59f00,#e03131);transition:width .9s ease}
.bar.done i{background:linear-gradient(90deg,#20c997,#00c853)}
.tagu{font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;background:#fff3bf;color:#a15c07}.tagu.ok{background:#d3f9d8;color:#2b8a3e}
.menu-pop{position:absolute;z-index:4;background:#fff;border:1px solid #bdbdbd;box-shadow:2px 3px 8px rgba(0,0,0,.2);font-size:11px;padding:2px 0;animation:popIn .25s ease}
.menu-pop div{display:flex;align-items:center;gap:6px;height:22px;padding:0 12px 0 6px}.menu-pop div.hl{background:#cbcbcb}
.menu-pop img{width:16px;height:16px}

/* ---------- Manual ---------- */
.mtop{position:sticky;top:0;z-index:20;background:var(--navy);color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
.mtop .wrap{max-width:1320px;display:flex;align-items:center;gap:20px;height:60px}
.mtop .search{margin-left:auto;position:relative;width:min(380px,45vw)}
.mtop .search input{width:100%;font:inherit;font-size:15px;padding:9px 14px 9px 36px;border-radius:10px;border:1px solid rgba(255,255,255,.2);
background:rgba(255,255,255,.08);color:#fff;outline:none}
.mtop .search input::placeholder{color:#94a3b8}.mtop .search input:focus{border-color:#4dabf7;background:rgba(255,255,255,.12)}
.mtop .search svg{position:absolute;left:11px;top:11px}
.mtop .search kbd{position:absolute;right:9px;top:9px}
.mlayout{max-width:1320px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:260px 1fr;gap:44px}
.toc{position:sticky;top:60px;height:calc(100vh - 60px);overflow:auto;padding:26px 0 40px}
.toc .g{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);font-weight:700;margin:18px 0 6px 10px}
.toc a{display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:8px;color:var(--ink2);text-decoration:none;font-size:15px}
.toc a img{width:22px;height:22px}.toc a:hover{background:#eaf0f8}.toc a.on{background:var(--pri-soft);color:var(--pri2);font-weight:650}
.toc a.hide{display:none}
.mcontent{padding:30px 0 120px;min-width:0;max-width:860px}
.mhead h1{font-size:38px;margin:6px 0 8px;letter-spacing:-.02em}.mhead p{color:var(--ink2);font-size:18px;margin:0 0 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:24px 0 10px}
.cards a{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:#fff;border:1px solid var(--bd);text-decoration:none;color:var(--ink);
font-weight:650;box-shadow:0 1px 2px rgba(0,0,0,.03);transition:transform .15s,box-shadow .15s}.cards a:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.cards img{width:34px;height:34px}
.topic{scroll-margin-top:76px;padding-top:28px;margin-top:22px;border-top:1px solid var(--bd)}
.topic.hide{display:none}
.topic>h2{display:flex;align-items:center;gap:12px;font-size:28px;margin:0 0 6px;letter-spacing:-.015em}.topic>h2 img{width:38px;height:38px}
.topic>.intro{color:var(--ink2);font-size:17px;margin:0 0 14px}
.topic h3{font-size:19px;margin:24px 0 8px;scroll-margin-top:76px}
.topic p,.topic li{color:var(--ink2)}
ol.steps{list-style:none;counter-reset:s;padding:0;margin:10px 0 16px}
ol.steps>li{counter-increment:s;position:relative;padding:2px 0 12px 44px}
ol.steps>li::before{content:counter(s);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--pri);color:#fff;
font-weight:700;font-size:14px;display:grid;place-items:center}
ol.steps>li::after{content:"";position:absolute;left:13.5px;top:30px;bottom:0;width:1px;background:var(--bd)}
ol.steps>li:last-child::after{display:none}
.ui{display:inline-flex;align-items:center;gap:4px;font-weight:650;color:var(--ink);background:#eef2f7;border:1px solid #dbe3ee;border-radius:6px;padding:0 7px;font-size:.92em;white-space:nowrap}
.ui img{width:16px;height:16px}
kbd{font:600 12px/1 var(--font);padding:3px 7px;border-radius:6px;border:1px solid #cbd5e1;border-bottom-width:2px;background:#fff;color:var(--ink)}
.mtop kbd{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#cbd5e1}
.callout{display:flex;gap:12px;padding:13px 16px;border-radius:12px;margin:14px 0;background:var(--pri-soft);border:1px solid #c5ddf8}
.callout.warn{background:#fff8e6;border-color:#ffe2a3}.callout.ok{background:#e9f9ee;border-color:#bfe9cb}
.callout b.t{display:block;color:var(--ink)}.callout .ic{flex:none;font-size:18px;line-height:1.4}
.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin:12px 0}
.mini{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px 14px}.mini b{display:flex;align-items:center;gap:8px;color:var(--ink)}
.mini b img{width:26px;height:26px}.mini span{display:block;font-size:14px;color:var(--mut);margin-top:3px}
table.keys{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--bd);border-radius:12px;overflow:hidden;margin:10px 0}
table.keys td{padding:9px 14px;border-bottom:1px solid var(--bd)}table.keys td:first-child{width:170px}
details.faq{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:0 16px;margin:8px 0}
details.faq summary{cursor:pointer;font-weight:650;padding:13px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}
details.faq summary::after{content:"+";color:var(--pri);font-size:20px;line-height:1}details.faq[open] summary::after{content:"–"}
details.faq p{margin:0 0 14px}
.noresults{display:none;padding:40px;text-align:center;color:var(--mut);background:#fff;border:1px dashed var(--bd);border-radius:12px;margin-top:24px}
mark{background:#ffec99;border-radius:3px;padding:0 2px}
.tocbtn{display:none}

@media (max-width:960px){
  .hero .wrap,.feature .wrap,.feature.flip .wrap{grid-template-columns:1fr;gap:40px}.feature.flip .copy{order:0}
  .top nav a.hide-m{display:none}.hero{padding-top:110px}
  .top .btn{display:none}.hero .facts{gap:18px;flex-wrap:wrap}.hero .facts>div{min-width:90px}
  .mlayout{grid-template-columns:1fr}.toc{display:none;position:fixed;inset:60px 0 0 0;z-index:15;background:var(--bg);height:auto;padding:16px 24px}
  .toc.open{display:block}.tocbtn{display:inline-flex;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 10px;font:inherit}
  .mtop .search kbd{display:none}
}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
@media print{.mtop,.toc,.tocbtn{display:none}.mlayout{display:block}.topic.hide{display:block}}
`
