import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessPeople,publicAssessmentCard,ASSESSMENT_MODEL} from '../src/assessment.js';
const mine={card_id:'demo-mine',headline:'DEMO: I design agent permission systems',seeking:[{description:'DEMO: Need a concrete implementation case'}],offering:[{description:'DEMO: Can review delegation designs'}],subject_key:'secret-key',privateKey:'never-send',preferences:[{key:'contact',value:'private'}]};
const them={card_id:'demo-peer',headline:'DEMO: I build agents and need a delegation review',seeking:[{description:'DEMO: Need review'}],offering:[{description:'DEMO: Can share an implementation case'}]};
const evidence=[{card_id:mine.card_id,field:'headline',quote:mine.headline},{card_id:them.card_id,field:'headline',quote:them.headline}];
function assessment(verdict='plausible_reciprocal_fit') {return {card_id:them.card_id,verdict,possible_value_to_me:{inference:'A concrete case may help test my design.',evidence},possible_value_to_them:{inference:'A review may help their implementation.',evidence},uncertainty:['Availability is not established.'],question:'Which delegation failure would you like to examine?'};}
function response(a:any,changes:any={}) {return new Response(JSON.stringify({id:'resp-controlled',model:ASSESSMENT_MODEL,status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({assessments:[a]})}]}],usage:{input_tokens:100,output_tokens:100},...changes}));}
const options=(r:()=>Promise<Response>)=>({key:'synthetic-test-key',fetch:r as typeof fetch});
test('three controlled cases: reciprocal, weak, ambiguous',async()=>{
  for(const verdict of ['plausible_reciprocal_fit','no_strong_reciprocal_reason','uncertain']) {
    const a=assessment(verdict);
    if(verdict==='no_strong_reciprocal_reason') {a.possible_value_to_them={inference:'No supported reciprocal benefit.',evidence:[]};}
    if(verdict==='uncertain') {a.question='Can you discuss a concrete case without exposing private information?';}
    const r=await assessPeople(mine,[them],options(async()=>response(a)));
    assert.equal(r.status,'available'); if(r.status==='available')assert.equal(r.assessments[0].verdict,verdict);
  }
});
test('provider receives only bounded public text, exact model, no tools, no storage',async()=>{
  let calls=0;
  const r=await assessPeople({...mine,visibility:{offering:'mutual_intro'},offering:[{description:'PRIVATE OFFER'}],contact:'PRIVATE CONTACT'},[them],{key:'synthetic-test-key',fetch:async(url,init)=>{
    calls++; assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(String(init?.body));assert.equal(body.model,ASSESSMENT_MODEL);assert.equal(body.store,false);assert.equal(body.tools,undefined);
    assert.ok(!String(init?.body).includes('PRIVATE'));assert.ok(!String(init?.body).includes('never-send'));assert.ok(!String(init?.body).includes('secret-key'));
    return response(assessment());
  }});
  assert.equal(calls,1);assert.equal(r.status,'available');
  assert.equal(publicAssessmentCard({...mine,visibility:{headline:'thread_only',seeking:'principal_only',offering:'mutual_intro'}}),null);
});
test('invalid, fabricated, cross-card, consent and incomplete outputs fail closed',async()=>{
  const badQuote=assessment();badQuote.possible_value_to_me.evidence=[{...evidence[0],quote:'invented'}];
  const wrongCard=assessment();wrongCard.possible_value_to_me.evidence=[{...evidence[0],card_id:'unrelated'}];
  const unsupported=assessment();unsupported.possible_value_to_them.evidence=[evidence[0]];
  for(const a of [badQuote,wrongCard,unsupported,{...assessment(),permission_granted:true}]) {
    assert.equal((await assessPeople(mine,[them],options(async()=>response(a)))).status,'unavailable');
  }
  for(const change of [{model:'another-model'},{status:'incomplete'},{output:[]}])assert.equal((await assessPeople(mine,[them],options(async()=>response(assessment(),change)))).status,'unavailable');
});
test('missing key, provider failure, malformed JSON and timeout do not throw or retry',async()=>{
  assert.equal((await assessPeople(mine,[them],{key:''})).status,'unavailable');
  for(const mock of [async()=>new Response('bad',{status:500}),async()=>new Response('{'),async()=>{throw new Error('private-provider-error');}]) {
    const r=await assessPeople(mine,[them],options(mock));assert.equal(r.status,'unavailable');assert.ok(!JSON.stringify(r).includes('private-provider-error'));
  }
  const r=await assessPeople(mine,[them],{key:'synthetic',timeoutMs:10,fetch:()=>new Promise(()=>{})});assert.equal(r.status,'unavailable');assert.equal((r as any).reason,'timeout');
});
test('bounded candidates preserve provider order and exclude the source',async()=>{
  let sent:any;
  await assessPeople(mine,[mine,...Array.from({length:8},(_,i)=>({...them,card_id:'demo-'+i}))],{key:'synthetic',fetch:async(_u,init)=>{sent=JSON.parse(JSON.parse(String(init?.body)).input);return new Response('error',{status:503});}});
  assert.deepEqual(sent.candidates.map((x:any)=>x.card_id),['demo-0','demo-1','demo-2']);
});

test('find_people integrates an advisory result while preserving deterministic cards',async()=>{
  const {registerCanonicalTools}=await import('../src/tools-canonical.js');
  const handlers=new Map<string,Function>();
  const writes:string[]=[];
  const keyBefore=process.env.OPENAI_API_KEY, fetchBefore=globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY='synthetic-test-key';
    globalThis.fetch=async()=>response(assessment());
    registerCanonicalTools({tool:(name:string,_description:string,_shape:any,handler:Function)=>handlers.set(name,handler)}, {
      api:async(path:string)=>{writes.push(path);return path.endsWith('/search')?{results:[them]}:{card_id:mine.card_id,card:{...mine,subject_key:'test-owner'},revocation_status:'active',expires_at:'2099-01-01T00:00:00Z'};},
      apiRaw:async()=>{throw new Error('No write allowed');},keys:{publicKey:'test-owner',privateKey:'unused'},agentId:'demo',asText:(x:any)=>x,legacyNonce:()=>'',skillVersion:'demo',sign:()=>{throw new Error('No signing allowed');}
    });
    const result=await handlers.get('find_people')!({assess:true,my_card_id:mine.card_id});
    assert.equal(handlers.size,8);assert.deepEqual(result.people,[them]);assert.equal(result.assessment.status,'available');
    assert.equal(result.assessment.assessments[0].card_id,them.card_id);
    assert.deepEqual(writes,['/api/v3/cards/search','/api/v3/cards/demo-mine']);
  } finally {globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keyBefore;}
});
