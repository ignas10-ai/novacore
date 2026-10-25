// Netikras Supabase naršyklėje (užklausų perėmimas) – tik UI kadrams, ne duomenų bazės testas (tam – tools/social-check.mjs).
// Naudoja playthrough.cjs ir screens.cjs: const {mockSupabase,CHAL_ID}=require("./mock-supabase.cjs").
const ME="11111111-1111-4111-8111-111111111111",CHAL_ID="22222222-2222-4222-8222-222222222222";
async function mockSupabase(p){
  const db={nick:null,groups:[],members:{}};
  const others=[{user_id:"a",nickname:"Martynas",best:318,games:4},{user_id:"b",nickname:"Stela",best:274,games:2},{user_id:"c",nickname:"Rūta",best:null,games:0}];
  const jwt=[{alg:"none"},{sub:ME,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600}].map(o=>Buffer.from(JSON.stringify(o)).toString("base64url")).join(".")+".x";
  const cors={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"*","access-control-expose-headers":"*"};
  await p.setRequestInterception(true);
  p.on("request",r=>{
    const u=new URL(r.url());
    if(!u.hostname.endsWith(".supabase.co"))return r.continue();
    const send=(status,body)=>r.respond({status,headers:{...cors,"content-type":"application/json"},body:body===undefined?"":JSON.stringify(body)});
    if(r.method()==="OPTIONS")return send(204);
    const path=u.pathname,body=r.postData()?JSON.parse(r.postData()):{};
    if(path==="/auth/v1/signup")return send(200,{access_token:jwt,token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:"r",user:{id:ME,aud:"authenticated",role:"authenticated",is_anonymous:true,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
    if(path==="/rest/v1/profiles")return r.method()==="GET"?send(200,db.nick?[{nickname:db.nick}]:[]):(db.nick=body.nickname,send(201));
    if(path==="/rest/v1/groups")return send(200,db.groups);
    if(path==="/rest/v1/games")return send(201);
    if(path==="/rest/v1/group_members")return send(204);
    if(path==="/rest/v1/rpc/create_group"||path==="/rest/v1/rpc/join_group"){
      const g=path.endsWith("create_group")?{id:"g1",name:body.p_name,code:"K7Q2ZX",owner_id:ME}:{id:"g2",name:"Krepšinio komanda",code:body.p_code.toUpperCase(),owner_id:"a"};
      if(!db.groups.some(x=>x.id===g.id))db.groups.push(g);return send(200,g);
    }
    if(path==="/rest/v1/rpc/group_leaderboard"){
      const meRow={user_id:ME,nickname:db.nick||"?",best:body.gid==="g2"?291:null,games:body.gid==="g2"?3:0};
      return send(200,body.gid==="g2"?[others[0],meRow,others[1],others[2]]:[meRow]);
    }
    if(path==="/rest/v1/rpc/get_challenge")return send(200,[{nickname:"Martynas",score:4,duration:60,players:1,exercises:["squat","jack","knees"],created_at:new Date().toISOString()}]);
    console.log("! nemokama užklausa",r.method(),path);send(404,{message:"mock"});
  });
}
module.exports={mockSupabase,CHAL_ID,ME};
