import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSkuReferences, assertSkuTextContext, ecommerceTag } from './ecommerce-contract';
import { runTasksInOrder } from './serial-tasks';

test('SKU references require own product and exclude foreign or lifestyle inputs from listings',()=>{
 const product={sku:'black',role:'product'} as const;
 const style={sku:'black',role:'style'} as const;
 assert.doesNotThrow(()=>assertSkuReferences('black','main',[product]));
 assert.doesNotThrow(()=>assertSkuReferences('black','scene',[product,style]));
 assert.throws(()=>assertSkuReferences('black','main',[product,style]));
 assert.throws(()=>assertSkuReferences('black','scene',[product,{sku:'white',role:'product'}]));
 assert.throws(()=>assertSkuReferences('black','scene',[style]));
 assert.throws(()=>assertSkuReferences('black','scene',[product,null]));
 assert.equal(ecommerceTag({ecommerce:{sku:'black',role:'invalid'}}),null);
});
test('selected image tasks await each result and stop on first failure',async()=>{
 const calls:string[]=[];let finish!:(value:boolean)=>void;
 const gate=new Promise<boolean>(resolve=>finish=resolve);
 const pending=runTasksInOrder(['first','second','third'],async id=>{calls.push(id);return id==='first'?gate:false;},()=>false,()=>{});
 assert.deepEqual(calls,['first']);finish(true);
 const result=await pending;
 assert.deepEqual(calls,['first','second']);assert.equal(result.failedId,'second');assert.equal(result.completed,1);
});
test('stop after current never submits remaining or duplicate tasks',async()=>{
 let stop=false;const calls:string[]=[];
 const result=await runTasksInOrder(['one','one','two'],async id=>{calls.push(id);stop=true;return true;},()=>stop,()=>{});
 assert.deepEqual(calls,['one']);assert.equal(result.stopped,true);
});

test('SKU prompts cannot use another SKU facts node',()=>{
 const prefix='sku-1234567890abcdef';
 assert.doesNotThrow(()=>assertSkuTextContext(prefix,[prefix+'-facts']));
 assert.throws(()=>assertSkuTextContext(prefix,[]));
 assert.throws(()=>assertSkuTextContext(prefix,[prefix+'-facts','sku-abcdef1234567890-facts']));
});

test('photo metadata preserves confirmed facts without inventing product specifications',async()=>{
 const {preservationPrompt}=await import('./ecommerce-contract');
 const tag=ecommerceTag({ecommerce:{sku:'white',role:'product',shot:'front',color:'white',preserve:'THERMOS Logo'}});
 assert.equal(tag?.shot,'front');
 const prompt=preservationPrompt([tag,tag,{sku:'white',role:'style',preserve:'red props'}]);
 assert.match(prompt,/THERMOS Logo/);assert.match(prompt,/white/);assert.doesNotMatch(prompt,/500ml|red props/);
 assert.equal(ecommerceTag({ecommerce:{sku:'white',role:'product',shot:'unknown'}}),null);
});

test('scene inputs require the explicitly adopted main asset, not raw photos or another result',async()=>{
 const {validateEcommerceInputs}=await import('./ecommerce-contract');
 const prefix='sku-1234567890abcdef',id=prefix+'-adopted-main';
 const cards={[id]:{kind:'asset',assetId:'main-a',referenceCardIds:[prefix+'-main-image']}};
 const main={id:'main-a',source:'provider',metadata:{ecommerce:{sku:'white',role:'product',preserve:'Logo'},sourceCardId:prefix+'-main-image',ecommerceOutput:{task:'main'}}};
 const raw={id:'raw',metadata:{ecommerce:{sku:'white',role:'product'}}};
 assert.equal(validateEcommerceInputs({prefix,task:'scene-office',references:[id],cards,assets:[main]}).sku,'white');
 assert.throws(()=>validateEcommerceInputs({prefix,task:'scene-office',references:[],cards,assets:[main]}),/Adopt/);
 assert.throws(()=>validateEcommerceInputs({prefix,task:'scene-office',references:[id],cards,assets:[raw]}),/Adopt/);
 assert.throws(()=>validateEcommerceInputs({prefix,task:'scene-office',references:[id],cards,assets:[main,raw]}),/Scene identity/);
 assert.throws(()=>validateEcommerceInputs({prefix,task:'scene-office',references:[id],cards,assets:[{...main,id:'main-b'}]}),/Adopt/);
});

test('cross-SKU master is permitted only via an explicit adopted-master placement',async()=>{
 const {validateEcommerceInputs}=await import('./ecommerce-contract');
 const prefix='sku-1234567890abcdef',masterId=prefix+'-master-reference',adoptedId='sku-abcdef1234567890-adopted-main';
 const own={id:'white-photo',metadata:{ecommerce:{sku:'white',role:'product',color:'white'}}};
 const master={id:'black-main',source:'provider',metadata:{ecommerce:{sku:'black',role:'product',color:'black'},sourceCardId:'sku-abcdef1234567890-main-image',ecommerceOutput:{task:'main'}}};
 const cards={
  [masterId]:{kind:'asset',assetId:'black-main',referenceCardIds:[adoptedId]},
  [adoptedId]:{kind:'asset',assetId:'black-main',referenceCardIds:['sku-abcdef1234567890-main-image']},
 };
 const result=validateEcommerceInputs({prefix,task:'main',references:[masterId],cards,assets:[own,master]});
 assert.equal(result.sku,'white');assert.equal(result.hasMaster,true);assert.equal(result.tags.length,1);
 assert.throws(()=>validateEcommerceInputs({prefix,task:'main',references:[],cards,assets:[own,master]}),/another SKU/);
 assert.throws(()=>validateEcommerceInputs({prefix,task:'main',references:[masterId],cards:{...cards,[masterId]:{...cards[masterId],referenceCardIds:[]}},assets:[own,master]}),/adopted/);
});
