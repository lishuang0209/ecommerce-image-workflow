export async function runTasksInOrder(ids: string[], run: (id:string)=>Promise<boolean>, stop: ()=>boolean, progress: (current:number,total:number)=>void) {
 let completed=0;
 for(const [index,id] of [...new Set(ids)].entries()) {
  if(stop())return {completed,stopped:true,failedId:null};
  progress(index+1,new Set(ids).size);
  if(!await run(id))return {completed,stopped:false,failedId:id};
  completed++;
 }
 return {completed,stopped:false,failedId:null};
}
