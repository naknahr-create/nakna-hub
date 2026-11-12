import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://nakna-hub.nakna.workers.dev'),title:'นากนะ HUB — หนึ่งฮับ ครบทุกตัวตน',description:'สร้างหน้ารวมลิงก์ในแบบของคุณ รวมช่องทางติดต่อ เว็บไซต์ และผลงาน พร้อมสถิติการคลิก ใช้ง่ายบนทุกหน้าจอ',openGraph:{title:'นากนะ HUB — หนึ่งฮับ ครบทุกตัวตน',description:'ทุกลิงก์ ทุกช่องทาง ในพื้นที่ที่เป็นคุณ',locale:'th_TH',type:'website'},icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>;}
