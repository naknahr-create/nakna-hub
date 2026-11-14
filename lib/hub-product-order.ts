import type {HubLink,HubContentType} from './hub-types';

/** Reorder only entries within a content group, preserving all other positions. */
export function reorderTypedContentIds(links:readonly Pick<HubLink,'id'|'type'>[],type:HubContentType,index:number,direction:number):string[]|null{
  const positions=links.flatMap((link,i)=>link.type===type?[i]:[]);
  const target=index+direction;
  if(index<0||target<0||index>=positions.length||target>=positions.length)return null;
  const ids=links.map(link=>link.id);
  [ids[positions[index]],ids[positions[target]]]=[ids[positions[target]],ids[positions[index]]];
  return ids;
}
export function reorderProductIds(links:readonly Pick<HubLink,'id'|'type'>[],index:number,direction:number):string[]|null{
  return reorderTypedContentIds(links,'service',index,direction);
}
