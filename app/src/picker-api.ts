import{Hono}from"hono";
import{getCookie}from"hono/cookie";
import{hash}from"./auth";
import{recommend,type Candidate}from"./domain";

type Bindings={DB:D1Database};
type User={id:string;email:string;role:string};
type Variables={user:User};
type TableMode="any"|"competitive"|"cooperative";
type PickerBody={players?:number;playerBand?:string;minutes?:number;minWeight?:number;maxWeight?:number;includeForTrade?:boolean;mode?:string};
type PickerRow={id:number;name:string;sourceName:string|null;minPlayers:number;maxPlayers:number;minutes:number;weight:number;pollKey:string;best:number;recommended:number;notRecommended:number;cooperative:number};
type ValidPicker={players:number;playerBand:string;pollKey:string;minutes:number;minWeight:number;maxWeight:number;includeForTrade:boolean;mode:TableMode};
const api=new Hono<{Bindings:Bindings;Variables:Variables}>();

api.use("*",async(c,next)=>{
  const token=getCookie(c,"bge_session");
  if(!token)return c.json({error:"Authentication required"},401);
  const user=await c.env.DB.prepare("SELECT users.id,users.email,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND users.disabled_at IS NULL").bind(await hash(token)).first<User>();
  if(!user)return c.json({error:"Authentication required"},401);
  c.set("user",user);
  await next();
});

api.get("/status",async c=>{
  const user=c.get("user");
  const row=await c.env.DB.prepare("SELECT COUNT(DISTINCT ci.bgg_id) owned,COUNT(DISTINCT CASE WHEN g.bgg_fetched_at IS NOT NULL THEN ci.bgg_id END) enriched FROM collection_items ci JOIN games g ON g.id=ci.bgg_id WHERE ci.user_id=? AND ci.own=1").bind(user.id).first<{owned:number;enriched:number}>();
  const account=await c.env.DB.prepare("SELECT username,last_collection_sync_at lastCollectionSyncAt,last_full_sync_at lastFullSyncAt FROM source_accounts WHERE user_id=? AND provider='bgg'").bind(user.id).first();
  return c.json({account:account??null,owned:Number(row?.owned??0),enriched:Number(row?.enriched??0)});
});

api.post("/recommend",async c=>{
  const user=c.get("user"),body=await safeJson<PickerBody>(c),input=validatePicker(body);
  if(!input.ok)return c.json({error:input.error},400);
  const{players,playerBand,pollKey,minutes,minWeight,maxWeight,includeForTrade,mode}=input.value;
  const fallbackPollKey=pollKey==="8+"?"8":pollKey;
  const rows=await c.env.DB.prepare(`SELECT
    g.id,g.name,MAX(ci.source_name) sourceName,g.min_players minPlayers,g.max_players maxPlayers,
    g.play_time minutes,g.weight,gp.player_count pollKey,gp.best_votes best,
    gp.recommended_votes recommended,gp.not_recommended_votes notRecommended,
    EXISTS(SELECT 1 FROM game_tags gt WHERE gt.bgg_id=g.id AND gt.kind='mechanic' AND gt.name='Cooperative Game') cooperative
    FROM collection_items ci
    JOIN games g ON g.id=ci.bgg_id
    JOIN game_polls gp ON gp.bgg_id=g.id AND gp.player_count IN (?,?)
    WHERE ci.user_id=? AND ci.own=1 AND (?=1 OR ci.for_trade=0)
      AND g.bgg_fetched_at IS NOT NULL AND g.min_players IS NOT NULL AND g.max_players IS NOT NULL
      AND g.play_time>0 AND g.weight>0
    GROUP BY g.id,g.name,g.min_players,g.max_players,g.play_time,g.weight,gp.player_count,gp.best_votes,gp.recommended_votes,gp.not_recommended_votes
    LIMIT 2500`).bind(pollKey,fallbackPollKey,user.id,includeForTrade?1:0).all<PickerRow>();

  const chosenRows=preferPollRows(rows.results,pollKey);
  const modeRows=chosenRows.filter(row=>mode==="any"||(mode==="cooperative"?Number(row.cooperative)===1:Number(row.cooperative)===0));
  const candidates:Candidate[]=modeRows.map(row=>({id:Number(row.id),name:row.name,minPlayers:Number(row.minPlayers),maxPlayers:Number(row.maxPlayers),minutes:Number(row.minutes),weight:Number(row.weight),best:Number(row.best),recommended:Number(row.recommended),notRecommended:Number(row.notRecommended)}));
  const ranked=recommend(candidates,players,minutes,minWeight,maxWeight);
  const sourceNames=new Map(modeRows.map(row=>[Number(row.id),row.sourceName]));
  const cooperativeById=new Map(modeRows.map(row=>[Number(row.id),Number(row.cooperative)===1]));
  const results=ranked.map(item=>formatResult(item,sourceNames.get(item.id)??null,players,playerBand,cooperativeById.get(item.id)??false));
  return c.json({
    query:{players,playerBand,minutes,minWeight,maxWeight,includeForTrade,mode},
    eligibleCount:candidates.filter(game=>isEligible(game,players,minutes,minWeight,maxWeight)).length,
    results,
    relaxations:results.length<5?suggestRelaxations({minutes,minWeight,maxWeight,includeForTrade,mode}):[]
  });
});

export default api;

export function validatePicker(body:Partial<PickerBody>):{ok:true;value:ValidPicker}|{ok:false;error:string}{
  const players=Number(body.players),minutes=Number(body.minutes),minWeight=Number(body.minWeight),maxWeight=Number(body.maxWeight);
  if(!Number.isInteger(players)||players<1||players>20)return{ok:false,error:"Player count must be between 1 and 20"};
  if(!Number.isFinite(minutes)||minutes<15||minutes>720)return{ok:false,error:"Available time must be between 15 and 720 minutes"};
  if(!Number.isFinite(minWeight)||!Number.isFinite(maxWeight)||minWeight<0||maxWeight>5||minWeight>maxWeight)return{ok:false,error:"Weight range must stay between 0 and 5"};
  const playerBand=(body.playerBand??String(players)).trim();
  if(playerBand!==String(players)&&!(players===8&&playerBand==="8+"))return{ok:false,error:"Unsupported player-count band"};
  const mode=(body.mode??"any") as TableMode;
  if(!["any","competitive","cooperative"].includes(mode))return{ok:false,error:"Table style must be either, competitive, or cooperative"};
  return{ok:true,value:{players,playerBand,pollKey:playerBand,minutes,minWeight,maxWeight,includeForTrade:body.includeForTrade===true,mode}};
}

function preferPollRows(rows:PickerRow[],preferredKey:string):PickerRow[]{
  const chosen=new Map<number,PickerRow>();
  for(const row of rows){
    const id=Number(row.id),current=chosen.get(id);
    if(!current||row.pollKey===preferredKey&&current.pollKey!==preferredKey)chosen.set(id,row);
  }
  return[...chosen.values()];
}
function isEligible(game:Candidate,players:number,minutes:number,minWeight:number,maxWeight:number){return players>=game.minPlayers&&players<=game.maxPlayers&&game.minutes<=minutes&&game.weight>=minWeight&&game.weight<=maxWeight}
function formatResult(item:ReturnType<typeof recommend>[number],sourceName:string|null,players:number,playerBand:string,cooperative:boolean){
  const total=item.best+item.recommended+item.notRecommended,percent=(value:number)=>total?Math.round(value/total*100):0;
  const positivePercent=percent(item.best+item.recommended);
  return{id:item.id,name:item.name,sourceName:sourceName&&sourceName!==item.name?sourceName:null,players,playerBand,minutes:item.minutes,weight:item.weight,best:item.best,recommended:item.recommended,notRecommended:item.notRecommended,votes:total,bestPercent:percent(item.best),positivePercent,notRecommendedPercent:percent(item.notRecommended),confidence:Math.min(1,total/50),score:item.score,cooperative,warning:item.warning,reason:`${positivePercent}% positive at ${playerBand} players · ${total} votes · ${item.minutes} min`};
}
function suggestRelaxations(input:{minutes:number;minWeight:number;maxWeight:number;includeForTrade:boolean;mode:TableMode}){
  const result:string[]=[];
  if(input.minutes<720)result.push("Increase available time");
  if(input.minWeight>0||input.maxWeight<5)result.push("Widen the complexity range");
  if(input.mode!=="any")result.push("Allow either competitive or cooperative games");
  if(!input.includeForTrade)result.push("Include games marked for trade");
  return result;
}
async function safeJson<T>(c:{req:{json:()=>Promise<T>}}):Promise<Partial<T>>{try{return await c.req.json()}catch{return{}}}
