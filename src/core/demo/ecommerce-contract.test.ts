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
test('two image tasks start together and a failure does not start the rest',async()=>{
 const calls:string[]=[];
 let finish!:(value:boolean)=>void;
 const gate=new Promise<boolean>(resolve=>finish=resolve);
 const pending=runTasksInOrder(['first','second','third'],async id=>{calls.push(id);return id==='first'?gate:false;},()=>false,()=>{});
 assert.deepEqual(calls,['first','second']);
 finish(true);
 const result=await pending;
 assert.deepEqual(calls,['first','second']);
 assert.equal(result.failedId,'second');
 assert.deepEqual(result.succeeded,['first']);
 assert.equal(result.stopped,false);
});
test('stop finishes tasks already started and skips the queued image',async()=>{
 const calls:string[]=[];
 let finish!:(value:boolean)=>void;
 const gate=new Promise<boolean>(resolve=>finish=resolve);
 let stop=false;
 const pending=runTasksInOrder(['one','two','three'],async id=>{calls.push(id);await gate;return true;},()=>stop,()=>{});
 assert.deepEqual(calls,['one','two']);
 stop=true;
 finish(true);
 const result=await pending;
 assert.deepEqual(calls,['one','two']);
 assert.equal(result.stopped,true);
 assert.deepEqual(result.succeeded,['one','two']);
});
test('duplicate task ids are submitted once',async()=>{
 const calls:string[]=[];
 const result=await runTasksInOrder(['one','one'],async id=>{calls.push(id);return true;},()=>false,()=>{});
 assert.deepEqual(calls,['one']);
 assert.equal(result.completed,1);
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

test('workflow and generation share prompt readiness including empty and cross-SKU text',async()=>{
 const {isEcommerceTaskPromptReady,pendingEcommercePrompt}=await import('./ecommerce-contract');
 const prefix='sku-1234567890abcdef',id=prefix+'-main-prompt';
 const card={id:prefix+'-main-image',referenceCardIds:[id]};
 const text={kind:'text',textContent:pendingEcommercePrompt,referenceCardIds:[prefix+'-facts']};
 assert.equal(isEcommerceTaskPromptReady(card,{[id]:text}),false);
 assert.equal(isEcommerceTaskPromptReady(card,{[id]:{...text,textContent:'  '}}),false);
 const ready={...text,textContent:'Pure white background. Retain logo and product structure.'};
 assert.equal(isEcommerceTaskPromptReady(card,{[id]:ready}),true);
 assert.equal(isEcommerceTaskPromptReady({...card,referenceCardIds:[]},{[id]:ready}),false);
 assert.equal(isEcommerceTaskPromptReady(card,{[id]:{...ready,referenceCardIds:['sku-abcdef1234567890-facts']}}),false);
});


test('reference roles keep detail and scene photos from deciding the main image view',async()=>{
 const {productReferenceRole,productReferenceRank}=await import('./ecommerce-contract');
 const product={sku:'S',role:'product'} as const;
 const front={...product,shot:'front'} as const,detail={...product,shot:'detail'} as const,scene={...product,shot:'scene'} as const;
 const roles=[front,detail,scene,product,{sku:'S',role:'detail'} as const].map(productReferenceRole);
 assert.equal(new Set(roles.slice(0,4)).size,4,'each photo type gets its own instruction');
 assert.match(roles[1],/禁止作为整体视角/);
 assert.match(roles[2],/禁止沿用其背景/);
 assert.equal(roles[4],roles[1],'a detail role is described like a detail shot');
 // A sole close-up listed first must be moved behind whole-product photos.
 const photos:{sku:string;role:'product'|'detail'|'style';shot?:'front'|'detail'|'scene'}[]=[detail,scene,product,front];
 const ordered=photos.sort((a,b)=>productReferenceRank(a)-productReferenceRank(b)).map(tag=>tag.shot??'plain');
 assert.deepEqual(ordered,['front','plain','detail','scene']);
});

test('custom scene ids are recognized and explicit descriptions override legacy demo defaults',async()=>{
 const {ecommerceTaskPattern,ecommercePromptPattern,sceneDescriptionForTask}=await import('./ecommerce-contract');
 const id='sku-1234567890abcdef-scene-abcdef1234567890-image';
 assert.equal(ecommerceTaskPattern.exec(id)?.[2],'scene-abcdef1234567890');
 assert.ok(ecommercePromptPattern.test(id.replace(/-image$/,'-prompt')));
 assert.equal(sceneDescriptionForTask(id,{[id.replace(/-image$/,'-brief')]:{textContent:'梳妆台'}}),'梳妆台');
 const legacy='sku-1234567890abcdef-scene-outdoor-image';
 assert.equal(sceneDescriptionForTask(legacy,{}),'户外森林');
 assert.equal(sceneDescriptionForTask(legacy,{[legacy.replace(/-image$/,'-brief')]:{textContent:'影棚静物'}}),'影棚静物');
});

test('composition template text round-trips and is complete only with all three choices', async () => {
 const { compositionTemplateText, parseCompositionTemplate, isCompleteCompositionTemplate } = await import('./ecommerce-contract');
 const text = compositionTemplateText({ count: 'pair', facing: 'threeQuarter', scale: 'large' });
 assert.deepEqual(parseCompositionTemplate(text), { count: 'pair', facing: 'threeQuarter', scale: 'large' });
 assert.ok(isCompleteCompositionTemplate(text));
 assert.ok(!isCompleteCompositionTemplate(text.split('\n').filter(line => !line.startsWith('朝向：')).join('\n')));
 assert.ok(!isCompleteCompositionTemplate(undefined));
});

test('product name is part of the facts and only identical non-empty products match', async () => {
 const { preservationPrompt, assertSameProduct } = await import('./ecommerce-contract');
 const tags = [{ sku: 'White', product: 'Air Force 1', role: 'product' as const }, { sku: 'Black', product: 'Air Force 1', role: 'product' as const }, { sku: 'Cup', product: 'Thermos', role: 'product' as const }, { sku: 'Bare', role: 'product' as const }];
 assert.match(preservationPrompt([tags[0]]), /商品：Air Force 1；SKU：White/);
 assert.doesNotThrow(() => assertSameProduct('White', 'Black', tags));
 assert.throws(() => assertSameProduct('White', 'Cup', tags), /different products/);
 assert.throws(() => assertSameProduct('White', 'Bare', tags), /same product name/);
});
