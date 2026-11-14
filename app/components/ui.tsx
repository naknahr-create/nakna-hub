import {ArrowUpRight, BriefcaseBusiness, FileText, Globe2, Camera, Link2, Mail, MapPin, MessageCircle, Music2, Play, Sparkles, Video, Phone, MessageSquare, ShoppingBag, CalendarDays, Headphones, Coffee, BookOpen, Palette, Heart, PenTool} from 'lucide-react';

export function HubBrand({compact=false,light=false}:{compact?:boolean;light?:boolean}){
  return <span className={`hub-brand ${compact?'hub-brand-compact':''} ${light?'hub-brand-light':''}`}><img className="hub-brand-mark" src="/brand/hub-logo.webp" alt="นากนะ HUB" width={44} height={44} decoding="async"/></span>;
}
export function HubIcon({name='link',size=22}:{name?:string;size?:number}){
 const icons:Record<string,typeof Link2>={file:FileText,document:FileText,line:MessageCircle,messenger:MessageSquare,map:MapPin,location:MapPin,briefcase:BriefcaseBusiness,work:BriefcaseBusiness,globe:Globe2,website:Globe2,link:Link2,instagram:Camera,mail:Mail,email:Mail,tiktok:Music2,youtube:Play,video:Video,phone:Phone,facebook:MessageSquare,sparkles:Sparkles,arrow:ArrowUpRight,shop:ShoppingBag,calendar:CalendarDays,music:Headphones,coffee:Coffee,book:BookOpen,art:Palette,heart:Heart,design:PenTool};
 const Icon=icons[name.toLowerCase()]||Link2;
 return <Icon size={size} strokeWidth={1.75} aria-hidden="true"/>;
}
