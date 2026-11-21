const B='http://127.0.0.1:8766/';
const m3u=`#EXTM3U
#EXTINF:-1 tvg-id="Teletica.cr@SD" group-title="General",Teletica 7 (720p)
${B}master.m3u8
#EXTINF:-1 tvg-id="Canal13.cr" group-title="News",Canal 13 (720p) [Not 24/7]
${B}live.m3u8
#EXTINF:-1 group-title="Sports",Deportes Caído
http://127.0.0.1:9/nada.m3u8
#EXTINF:-1 group-title="Kids;Animation",Kids TV
${B}clip.mp4
#EXTINF:-1 group-title="Sports",FUTV (1080p)
${B}live2.m3u8
`;
const now=Date.now();
const espn={events:[
 {id:'1',date:new Date(now-50*60e3).toISOString(),name:'A vs B',status:{displayClock:"52'",type:{state:'in',shortDetail:"52'"}},competitions:[{competitors:[{homeAway:'home',score:'1',team:{shortDisplayName:'Saprissa',logo:''}},{homeAway:'away',score:'0',team:{shortDisplayName:'Alajuelense',logo:''}}],broadcasts:[{names:['FUTV']}]}]},
 {id:'2',date:new Date(now+4*60e3).toISOString(),name:'C vs D',status:{type:{state:'pre',shortDetail:'8:00 PM'}},competitions:[{competitors:[{homeAway:'home',score:'0',team:{shortDisplayName:'Herediano',logo:''}},{homeAway:'away',score:'0',team:{shortDisplayName:'Cartaginés',logo:''}}],broadcasts:[{names:['Teletica']}]}]}
]};
const rss=`<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Podcast Prueba</title><description>Desc</description><itunes:image href=""/>
<item><title>Episodio 1</title><pubDate>Sat, 31 Oct 2026 10:00:00 GMT</pubDate><description>Primer episodio</description><enclosure url="${B}clip.mp4" type="audio/mpeg"/></item></channel></rss>`;
// Firebase simulado
const db={};
const getP=(p)=>p.split('/').filter(Boolean).reduce((o,k)=>o&&o[k],db);
const setP=(p,v)=>{const ks=p.split('/').filter(Boolean);let o=db;ks.slice(0,-1).forEach(k=>{o[k]=o[k]&&typeof o[k]==='object'?o[k]:{};o=o[k];});if(v===null)delete o[ks[ks.length-1]];else o[ks[ks.length-1]]=v;};
const users={};
async function install(p){
  await p.route(/iptv-org\.github\.io|raw\.githubusercontent\.com/,r=>r.fulfill({status:200,body:m3u,headers:{'access-control-allow-origin':'*'}}));
  await p.route(/site\.api\.espn\.com/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(r.request().url().includes('crc.1')?espn:{events:[]})}));
  await p.route(/radio-browser\.info/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([{name:'Radio Prueba',url_resolved:B+'clip.mp4',favicon:'',tags:'news,talk',stationuuid:'u1'},{name:'Radio Dos',url_resolved:B+'clip.mp4',favicon:'',tags:'music',stationuuid:'u2'}])}));
  await p.route(/itunes\.apple\.com/,r=>{const cb=new URL(r.request().url()).searchParams.get('callback');r.fulfill({status:200,contentType:'text/javascript',body:`${cb}({"results":[{"collectionName":"Podcast Prueba","feedUrl":"${B}feed.xml","artworkUrl600":"","artistName":"Autor"}]})`});});
  await p.route(B+'feed.xml',r=>r.fulfill({status:200,contentType:'application/rss+xml',headers:{'access-control-allow-origin':'*'},body:rss}));
  await p.route(/youtube-nocookie\.com/,r=>r.fulfill({status:200,contentType:'text/html',body:'<body style="background:#300;color:#fff">YT</body>'}));
  await p.route(/identitytoolkit\.googleapis\.com/,async r=>{const b=JSON.parse(r.request().postData());const op=r.request().url().includes('signUp')?'up':'in';
    if(op==='up'){users[b.email]={pw:b.password,uid:'uid'+Object.keys(users).length};}
    const u=users[b.email]; if(!u||u.pw!==b.password) return r.fulfill({status:400,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({error:{message:'INVALID_LOGIN_CREDENTIALS'}})});
    r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({idToken:'tok',refreshToken:'ref',localId:u.uid,email:b.email,expiresIn:'3600'})});});
  await p.route(/securetoken\.googleapis\.com/,r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({id_token:'tok',refresh_token:'ref',expires_in:'3600'})}));
  await p.route(/fake-rtdb\.test/,async r=>{const req=r.request();const u=new URL(req.url());const path=u.pathname.replace(/\.json$/,'');const h={'access-control-allow-origin':'*'};
    if((req.headers()['accept']||'').includes('text/event-stream')){
      return r.fulfill({status:200,headers:{...h,'content-type':'text/event-stream'},body:`retry: 1000\nevent: put\ndata: ${JSON.stringify({path:'/',data:getP(path)??null})}\n\n`});}
    const m=req.method();
    if(m==='GET') return r.fulfill({status:200,headers:h,contentType:'application/json',body:JSON.stringify(getP(path)??null)});
    if(m==='PUT'){setP(path,JSON.parse(req.postData()));return r.fulfill({status:200,headers:h,contentType:'application/json',body:req.postData()});}
    if(m==='POST'){const id='k'+Date.now()+Math.random().toString(36).slice(2,5);setP(path+'/'+id,JSON.parse(req.postData()));return r.fulfill({status:200,headers:h,contentType:'application/json',body:JSON.stringify({name:id})});}
    if(m==='DELETE'){setP(path,null);return r.fulfill({status:200,headers:h,contentType:'application/json',body:'null'});}
    r.fulfill({status:200,headers:h,body:'null'});});
}
module.exports={install,B,db};
