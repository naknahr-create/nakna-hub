import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://hub.naknahr.com'),title:'นากนะ HUB — หนึ่งฮับ ครบทุกตัวตน',description:'สร้างหน้ารวมลิงก์ในแบบของคุณ รวมช่องทางติดต่อ เว็บไซต์ และผลงาน พร้อมสถิติการคลิก ใช้ง่ายบนทุกหน้าจอ',openGraph:{title:'นากนะ HUB — หนึ่งฮับ ครบทุกตัวตน',description:'ทุกลิงก์ ทุกช่องทาง ในพื้นที่ที่เป็นคุณ',locale:'th_TH',type:'website',images:[{url:'/brand/hub-logo.webp',width:160,height:160,alt:'นากนะ HUB'}]},icons:{icon:[{url:'/brand/hub-icon.png',sizes:'64x64',type:'image/png'}],shortcut:'/brand/hub-icon.png',apple:'/brand/hub-icon.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>;}

