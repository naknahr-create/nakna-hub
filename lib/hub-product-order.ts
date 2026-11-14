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
  // The same visible rail contains both standard and discounted products.
  const positions=links.flatMap((link,i)=>link.type==='service'||link.type==='promotion'?[i]:[]);
  const target=index+direction;
  if(index<0||target<0||index>=positions.length||target>=positions.length)return null;
  const ids=links.map(link=>link.id);
  [ids[positions[index]],ids[positions[target]]]=[ids[positions[target]],ids[positions[index]]];
  return ids;
}


export type ProductGroupMove='top'|'up'|'down';

/**
 * The Studio visually represents all service and historical promotion rows as
 * one carousel at the earliest product position. Move that ONE visual group
 * among non-product blocks and write the resulting order back to D1.
 *
 * Existing product IDs and their internal order stay untouched, and all links,
 * galleries, headings, etc. retain their relative order.
 */
export function reorderProductGroupIds(
  links:readonly Pick<HubLink,'id'|'type'>[],
  direction:ProductGroupMove
):string[]|null{
  const products=links.filter(link=>link.type==='service'||link.type==='promotion').map(link=>link.id);
  if(!products.length)return null;
  const units:Array<{isProduct:boolean;ids:string[]}>= [];
  let inserted=false;
  for(const link of links){
    if(link.type==='service'||link.type==='promotion'){
      if(!inserted){units.push({isProduct:true,ids:products});inserted=true;}
    }else{
      units.push({isProduct:false,ids:[link.id]});
    }
  }
  const index=units.findIndex(unit=>unit.isProduct);
  if(index<0)return null;
  const next=direction==='top'?0:direction==='up'?index-1:index+1;
  if(!Number.isInteger(next)||next<0||next>=units.length||next===index)return null;
  const [group]=units.splice(index,1);
  units.splice(next,0,group);
  return units.flatMap(unit=>unit.ids);
}
