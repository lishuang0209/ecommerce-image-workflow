import test from 'node:test';
import assert from 'node:assert/strict';
import {groupEcommerceMaterials} from './ecommerce-profiles';
const photo=(id:string,color:string,preserve:string)=>({id,filename:id,url:'/image',tag:{sku:'black',role:'product' as const,shot:'front' as const,color,preserve}});
test('same SKU facts are presented once while individual photo classifications stay intact',()=>{
 const images=[photo('front','Matte black','THERMOS Logo'),{...photo('detail','Matte black','THERMOS Logo'),tag:{...photo('detail','Matte black','THERMOS Logo').tag,shot:'detail' as const}}];
 const groups=groupEcommerceMaterials(images);assert.equal(groups.length,1);assert.equal(groups[0].color,'Matte black');assert.equal(groups[0].preserve,'THERMOS Logo');assert.equal(groups[0].conflicting,false);assert.equal(groups[0].images[1].tag.shot,'detail');
});
test('legacy inconsistent facts are retained and flagged rather than silently overwritten',()=>{
 const groups=groupEcommerceMaterials([photo('a','Black','Logo'),photo('b','Blue','Text')]);
 assert.equal(groups[0].conflicting,true);assert.match(groups[0].color,/Black/);assert.match(groups[0].color,/Blue/);assert.match(groups[0].preserve,/Logo/);assert.match(groups[0].preserve,/Text/);
});
