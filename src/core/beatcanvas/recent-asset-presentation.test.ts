import test from 'node:test';
import assert from 'node:assert/strict';
import {presentRecentAssets} from './recent-asset-presentation';
const asset=(id:string,hash:string,source?:string)=>({id,sha256:hash,publicUrl:'/asset/'+id,width:1,height:1,createdAt:'2026-11-05',metadata:{sourceCardId:source,ecommerce:{sku:'white'}}});
test('picker collapses exact copies and shows latest per task, with older takes expandable',()=>{
 const rows=[asset('new','h1','main'),asset('copy','h1','main'),asset('old','h2','main'),asset('scene','h3','scene'),asset('raw','h4')];
 assert.deepEqual(presentRecentAssets(rows).map(a=>a.id),['new','scene','raw']);
 assert.deepEqual(presentRecentAssets(rows,true).map(a=>a.id),['new','old','scene','raw']);
 assert.equal(rows.length,5);
});
test('different SKUs and unrelated assets are not merged by appearance or filename',()=>{
 const a=asset('a','h'),b={...asset('b','h'),metadata:{ecommerce:{sku:'black'}}};
 assert.equal(presentRecentAssets([a,b]).length,2);
 assert.equal(presentRecentAssets([asset('c','one'),asset('d','two')]).length,2);
});
