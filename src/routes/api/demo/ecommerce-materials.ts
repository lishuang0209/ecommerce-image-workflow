import {getProjectAssetById} from '@/core/workspace-lib/assets/user-assets';
import {loadProjectWithLatestSnapshot} from '@/core/projects/projects';
import {ecommerceTag,ecommerceTaskPattern} from '@/core/demo/ecommerce-contract';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { bindEcommerceMaterials, listEcommerceMaterials, editEcommerceMaterial,editEcommerceProfile,skuNodePrefix } from '@/core/demo/ecommerce-materials';
import { ecommerceTagSchema } from '@/core/demo/ecommerce-contract';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';
async function POST({request}:{request:Request}) {
 const trust=validateTrustedWorkspaceJsonMutation(request);if(!trust.ok)return Response.json({error:trust.message},{status:trust.status});
 try{const body=await readRequestJsonWithLimit(request,4096);
 if(body&&typeof body==='object'&&'sceneCardId' in body){
  const input=z.object({projectId:z.string().uuid(),sceneCardId:z.string().max(128),assetId:z.string().uuid()}).strict().parse(body);
  const state=await loadProjectWithLatestSnapshot({projectId:input.projectId});
  const scene=state?.snapshot.cards.find(card=>card.id===input.sceneCardId),match=ecommerceTaskPattern.exec(input.sceneCardId);
  const asset=await getProjectAssetById({projectId:input.projectId,assetId:input.assetId}),tag=ecommerceTag(asset?.metadata);
  if(scene?.kind!=='generation'||!match||match[2]==='main'||!tag||skuNodePrefix(tag.sku)!==match[1])throw new Error('Choose a listing image belonging to this scene SKU.');
  await bindEcommerceMaterials({projectId:input.projectId,sku:tag.sku,action:'adopt',assetId:input.assetId});
  const saved=await loadProjectWithLatestSnapshot({projectId:input.projectId});
  if(!saved)throw new Error('Project is unavailable.');
  return Response.json({document:saved.snapshot,version:saved.snapshotVersion});
 }
 const input=z.object({projectId:z.string().uuid(),sku:ecommerceTagSchema.shape.sku,action:z.enum(['import','workflow','adopt']).optional(),assetId:z.string().uuid().optional(),masterSku:ecommerceTagSchema.shape.sku.optional()}).strict().parse(body);return Response.json(await bindEcommerceMaterials(input));}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to bind SKU materials.'},{status:400});}
}
async function GET({request}:{request:Request}){
 try{const projectId=z.string().uuid().parse(new URL(request.url).searchParams.get('projectId'));return Response.json({materials:await listEcommerceMaterials(projectId)});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to load materials.'},{status:400});}
}
async function PATCH({request}:{request:Request}){
 const trust=validateTrustedWorkspaceJsonMutation(request);if(!trust.ok)return Response.json({error:trust.message},{status:trust.status});
 try{const input=z.union([z.object({projectId:z.string().uuid(),assetId:z.string().uuid(),tag:ecommerceTagSchema,expectedTag:ecommerceTagSchema}).strict(),z.object({projectId:z.string().uuid(),sku:ecommerceTagSchema.shape.sku,color:z.string().trim().max(100),preserve:z.string().trim().max(1000),expected:z.array(z.object({assetId:z.string().uuid(),tag:ecommerceTagSchema}).strict()).min(1).max(500)}).strict()]).parse(await readRequestJsonWithLimit(request,1024*1024));return Response.json('expected' in input?await editEcommerceProfile(input):await editEcommerceMaterial(input));}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to save material tags.'},{status:400});}
}
export const Route=createFileRoute('/api/demo/ecommerce-materials')({server:{handlers:{GET,POST,PATCH}}});
