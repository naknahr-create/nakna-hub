import type {HubLink} from './hub-types';

/** Swap two product positions while leaving links, headings and other blocks untouched. */
export function reorderProductIds(links:readonly Pick<HubLink,'id'|'type'>[],index:number,direction:number):string[]|null{
  const positions=links.flatMap((link,i)=>link.type==='service'?[i]:[]);
  const target=index+direction;
  if(index<0||target<0||index>=positions.length||target>=positions.length)return null;
  const ids=links.map(link=>link.id);
  [ids[positions[index]],ids[positions[target]]]=[ids[positions[target]],ids[positions[index]]];
  return ids;
}
