import {ArrowUpRight, BriefcaseBusiness, FileText, Globe2, Camera, Link2, Mail, MapPin, MessageCircle, Music2, Play, Sparkles, Video, Phone, MessageSquare, ShoppingBag, CalendarDays, Headphones, Coffee, BookOpen, Palette, Heart, PenTool} from 'lucide-react';

export function HubBrand({compact=false,light=false}:{compact?:boolean;light?:boolean}){
  return <span className={`hub-brand ${compact?'hub-brand-compact':''} ${light?'hub-brand-light':''}`}><svg className="hub-brand-mark" width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="13" fill="currentColor"/><path d="M10.5 27V18.5a5 5 0 0 1 10 0V27m0-7.5a4.5 4.5 0 0 1 9 0V27" stroke="white" strokeWidth="3.4" strokeLinecap="round"/><circle cx="29" cy="10" r="2.5" fill="#DAE9AF"/></svg><span className="hub-brand-name">นากนะ<span className="hub-brand-label">HUB</span></span></span>;
}
export function HubIcon({name='link',size=22}:{name?:string;size?:number}){
 const icons:Record<string,typeof Link2>={file:FileText,document:FileText,line:MessageCircle,messenger:MessageSquare,map:MapPin,location:MapPin,briefcase:BriefcaseBusiness,work:BriefcaseBusiness,globe:Globe2,website:Globe2,link:Link2,instagram:Camera,mail:Mail,email:Mail,tiktok:Music2,youtube:Play,video:Video,phone:Phone,facebook:MessageSquare,sparkles:Sparkles,arrow:ArrowUpRight,shop:ShoppingBag,calendar:CalendarDays,music:Headphones,coffee:Coffee,book:BookOpen,art:Palette,heart:Heart,design:PenTool};
 const Icon=icons[name.toLowerCase()]||Link2;
 return <Icon size={size} strokeWidth={1.75} aria-hidden="true"/>;
}
