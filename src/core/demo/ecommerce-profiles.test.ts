import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueContentMaterials,groupEcommerceMaterials} from './ecommerce-profiles';
const photo=(id:string,color:string,preserve:string)=>({id,filename:id,url:'/image',tag:{sku:'black',role:'product' as const,shot:'front' as const,color,preserve}});
test('same SKU facts are presented once while individual photo classifications stay intact',()=>{
 const images=[photo('front','Matte black','THERMOS Logo'),{...photo('detail','Matte black','THERMOS Logo'),tag:{...photo('detail','Matte black','THERMOS Logo').tag,shot:'detail' as const}}];
 const groups=groupEcommerceMaterials(images);assert.equal(groups.length,1);assert.equal(groups[0].color,'Matte black');assert.equal(groups[0].preserve,'THERMOS Logo');assert.equal(groups[0].conflicting,false);assert.equal(groups[0].images[1].tag.shot,'detail');
});
test('legacy inconsistent facts are retained and flagged rather than silently overwritten',()=>{
 const groups=groupEcommerceMaterials([photo('a','Black','Logo'),photo('b','Blue','Text')]);
 assert.equal(groups[0].conflicting,true);assert.match(groups[0].color,/Black/);assert.match(groups[0].color,/Blue/);assert.match(groups[0].preserve,/Logo/);assert.match(groups[0].preserve,/Text/);
});

test('content duplicates collapse only with identical semantic tags and preserve source records',()=>{
 const a={...photo('a','Black','Logo'),sha256:'same'};
 const b={...a,id:'b',filename:'renamed.jpg'};
 const differentSku={...b,id:'c',tag:{...b.tag,sku:'white'}};
 const differentRole={...b,id:'d',tag:{...b.tag,role:'style' as const}};
 const differentBytes={...a,id:'e',sha256:'other'};
 const source=[a,b,differentSku,differentRole,differentBytes];
 assert.deepEqual(uniqueContentMaterials(source).map(item=>item.id),['a','c','d','e']);
 assert.equal(source.length,5);
 const conflicting={...b,tag:{...b.tag,color:'Matte black'}};
 assert.equal(uniqueContentMaterials([a,conflicting]).length,1);
 assert.equal(groupEcommerceMaterials([a,conflicting])[0].conflicting,true);
 assert.equal(uniqueContentMaterials([{...a,sha256:null},{...b,sha256:null}]).length,2);
});
