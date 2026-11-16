import type {HubLink,HubPlan,HubProfile} from './hub-types';

/** Storage quota applies to all hub assets owned by one account, not per page. */
export const HUB_STORAGE_LIMIT_BYTES:Record<HubPlan,number>={
  starter:0,
  pro:2*1024*1024*1024,
};
export const HUB_MAX_IMAGE_BYTES=2*1024*1024;
export const HUB_STARTER_LINK_LIMIT=5;

export function canCreateContent(plan:HubPlan,type:HubLink['type']):boolean{
  return plan==='pro'||type==='link';
}

/** The draft in D1 is never deleted on downgrade; only public visibility changes. */
export function publishedLinksForPlan<T extends Pick<HubLink,'type'|'icon'>>(links:T[],plan:HubPlan):T[]{
  if(plan==='pro')return links;
  return links.filter(link=>link.type==='link').slice(0,HUB_STARTER_LINK_LIMIT)
    .map(link=>link.icon.startsWith('image:')?{...link,icon:'auto'}:link);
}

export function publishedProfileForPlan(profile:HubProfile,plan:HubPlan):HubProfile{
  if(plan==='pro')return profile;
  return {...profile,avatarUrl:'',shareImageUrl:'',showBranding:true};
}
