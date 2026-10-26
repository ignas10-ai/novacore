// Netikras Supabase dvikovoms: bendra atmintinė DB (REST RPC) + Phoenix protokolo Realtime (broadcast, presence,
// postgres_changes, privataus duel:<id> kanalo patikra). Vienas šaltinis abiem: tools/duel-ui.cjs (puppeteer + ws serveris)
// ir test/e2e (Playwright route + routeWebSocket). createDuelMock() → nauja tuščia DB kiekvienam paleidimui.
// rest(me) = užklausos tvarkyklė (r.url/method/postData/respond/continue – puppeteer HTTPRequest forma), connect(ws) = vienas WS klientas.
function createDuelMock(){
  // ---------- bendra netikra DB ----------
  const U={A:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
  const db={nick:{},duels:[]};
  const G={id:"g1",name:"10B klasė",code:"K7Q2ZX",owner_id:U.A};
  const uuid=()=>require("crypto").randomUUID();
  const jwt=sub=>[{alg:"none"},{sub,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600}].map(o=>Buffer.from(JSON.stringify(o)).toString("base64url")).join(".")+".x";
  const cors={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"*","access-control-expose-headers":"*"};
  const rest=me=>r=>{
      const u=new URL(r.url());
      if(!u.hostname.endsWith(".supabase.co"))return r.continue();
      const send=(status,body)=>r.respond({status,headers:{...cors,"content-type":"application/json"},body:body===undefined?"":JSON.stringify(body)});
      if(r.method()==="OPTIONS")return send(204);
      const pth=u.pathname,body=r.postData()?JSON.parse(r.postData()):{};
      const fail=msg=>send(400,{code:"P0001",message:msg});
      if(pth==="/auth/v1/signup")return send(200,{access_token:jwt(me),token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:"r",user:{id:me,aud:"authenticated",role:"authenticated",is_anonymous:true,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
      if(pth==="/rest/v1/profiles"){if(r.method()==="GET")return send(200,db.nick[me]?[{nickname:db.nick[me]}]:[]);db.nick[me]=body.nickname;return send(201)}
      if(pth==="/rest/v1/groups")return send(200,[G]);
      if(pth==="/rest/v1/games"||pth==="/rest/v1/group_members")return send(201);
      if(pth==="/rest/v1/rpc/group_leaderboard")return send(200,[{user_id:U.B,nickname:db.nick[U.B]||"Martynas",best:318,games:4},{user_id:U.A,nickname:db.nick[U.A]||"Ignas",best:291,games:3}]);
      if(pth==="/rest/v1/rpc/get_challenge")return send(200,[]);
      if(pth==="/rest/v1/rpc/pending_duels")return send(200,db.duels.filter(d=>d.to_user===me&&d.status==="pending"&&Date.now()-Date.parse(d.created_at)<6e5).map(d=>({id:d.id,group_id:d.group_id,from_user:d.from_user,nickname:db.nick[d.from_user],settings:d.settings,created_at:d.created_at})));
      const d=db.duels.find(x=>x.id===body.p_id), upd=(x,o)=>{const old={...x};Object.assign(x,o);rt.change("UPDATE",x,old);return send(200,x)};
      if(pth==="/rest/v1/rpc/invite_duel"){
        if(body.p_to===me)return fail("duel_self");
        for(const x of db.duels)if(x.from_user===me&&x.to_user===body.p_to&&x.status==="pending"){const old={...x};x.status="cancelled";rt.change("UPDATE",x,old)}
        const n={id:uuid(),group_id:body.p_group,from_user:me,to_user:body.p_to,status:"pending",settings:{duration:body.p_duration,exercises:body.p_exercises,seed:Math.floor(Math.random()*1e6)},created_at:new Date().toISOString(),started_at:null,from_score:null,to_score:null,winner:null};
        db.duels.push(n);rt.change("INSERT",n);return send(200,n);
      }
      if(pth==="/rest/v1/rpc/respond_duel"){if(!d||d.to_user!==me)return fail("duel_not_found");if(d.status!=="pending")return fail("duel_closed");return upd(d,{status:body.p_accept?"accepted":"declined"})}
      if(pth==="/rest/v1/rpc/cancel_duel"){if(!d||![d.from_user,d.to_user].includes(me)||!["pending","accepted"].includes(d.status))return send(200,null);return upd(d,{status:"cancelled"})}
      if(pth==="/rest/v1/rpc/start_duel"){if(!d||d.from_user!==me||d.status!=="accepted")return fail("duel_closed");return upd(d,{status:"playing",started_at:new Date().toISOString()})}
      if(pth==="/rest/v1/rpc/finish_duel"){
        if(!d)return fail("duel_not_found");if(!(body.p_score>=0&&body.p_score<=2000))return fail("duel_bad_score");
        const k=me===d.from_user?"from_score":"to_score",o={[k]:d[k]??body.p_score};
        const f=o.from_score??d.from_score,t=o.to_score??d.to_score;
        if(f!=null&&t!=null){o.status="done";o.winner=f>t?d.from_user:t>f?d.to_user:null}else o.status="playing";
        return upd(d,o);
      }
      console.log("! nemokama užklausa",r.method(),pth);send(404,{message:"mock"});
    };

  // ---------- netikras Realtime (Phoenix, vsn 2.0.0) ----------
  const count={};
  const rt=(()=>{
    const topics=new Map(); // topic -> Map(ws -> member)
    const sub=t=>{try{return JSON.parse(Buffer.from(String(t).split(".")[1],"base64url")).sub}catch(e){return null}}; // public channels join with the publishable key, not a user JWT
    const tx=(ws,msg)=>{if(ws.readyState===1)ws.send(JSON.stringify(msg))};
    const members=t=>topics.get(t)||new Map();
    const state=t=>{const s={};for(const m of members(t).values())if(m.meta)s[m.key]={metas:[m.meta]};return s};
    const diff=(t,joins,leaves)=>{for(const [ws] of members(t))tx(ws,[null,null,t,"presence_diff",{joins,leaves}])};
    const fan=(t,from,event,payload)=>{count[event]=(count[event]||0)+1;for(const [ws,m] of members(t))if(ws!==from&&m.joined)tx(ws,[null,null,t,"broadcast",{type:"broadcast",event,payload}])};
    function leave(ws,t){const m=members(t).get(ws);if(!m)return;members(t).delete(ws);if(m.meta)diff(t,{},{[m.key]:{metas:[m.meta]}})}
    function connect(ws){ // ws: a `ws` server socket, or test/e2e/mocks.ts adapter (readyState, send, on message/close)
      ws.on("message",(data,isBinary)=>{
        if(isBinary){ // kind 3 = user broadcast push (realtime-js serializer)
          const b=new Uint8Array(data),[,jl,rl,tl,el,ml,enc]=b;let o=7;const s=n=>{const v=Buffer.from(b.slice(o,o+n)).toString();o+=n;return v};
          s(jl);s(rl);const t=s(tl),ev=s(el);s(ml);const raw=Buffer.from(b.slice(o)).toString();
          return fan(t,ws,ev,enc===1?JSON.parse(raw||"{}"):raw);
        }
        const [jr,ref,t,ev,p]=JSON.parse(String(data));
        const reply=(status,response={})=>tx(ws,[jr,ref,t,"phx_reply",{status,response}]);
        if(t==="phoenix")return reply("ok");
        if(ev==="phx_join"){
          const uid=sub(p.access_token||""),cfg=p.config||{};
          if(cfg.private){const id=t.replace(/^realtime:duel:/,""),d=db.duels.find(x=>x.id===id);if(!d||![d.from_user,d.to_user].includes(uid))return reply("error",{reason:"Unauthorized: You do not have permissions to read from this Channel topic"})}
          const pg=(cfg.postgres_changes||[]).map((f,i)=>({...f,id:i+1}));
          if(!topics.has(t))topics.set(t,new Map());
          members(t).set(ws,{uid,key:cfg.presence?.key||uid,pg,meta:null,joined:true,jr});
          reply("ok",{postgres_changes:pg});
          if(cfg.presence?.enabled)tx(ws,[jr,null,t,"presence_state",state(t)]);
          return;
        }
        const m=members(t).get(ws);
        if(ev==="phx_leave"){leave(ws,t);return reply("ok")}
        if(ev==="presence"&&p?.event==="track"&&m){m.meta={phx_ref:Math.random().toString(36).slice(2),...p.payload};count.presence=(count.presence||0)+1;diff(t,{[m.key]:{metas:[m.meta]}},{});return reply("ok")}
        if(ev==="broadcast"&&m){fan(t,ws,p.event,p.payload);return reply("ok")}
        reply("ok");
      });
      ws.on("close",()=>{for(const t of topics.keys())leave(ws,t)});
    }
    function change(type,record,old){
      for(const [t,ms] of topics)for(const [ws,m] of ms)for(const b of m.pg){
        if(b.table!=="duels"||(b.event!=="*"&&b.event!==type))continue;
        const [col,val]=(b.filter||"").split("=eq.");if(col&&String(record[col])!==val)continue;
        if(![record.from_user,record.to_user].includes(m.uid))continue; // RLS
        count.postgres_changes=(count.postgres_changes||0)+1;
        tx(ws,[null,null,t,"postgres_changes",{ids:[b.id],data:{schema:"public",table:"duels",commit_timestamp:new Date().toISOString(),type,record,old_record:old||{},columns:[],errors:null}}]);
      }
    }
    return {connect,change};
  })();
  return {U,G,db,count,rest,connect:rt.connect,change:rt.change};
}
module.exports={createDuelMock};
