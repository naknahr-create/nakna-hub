import type {HubProfile} from './hub-types';

/** Original NAKNA HUB designs. Every surface is authored here; no external assets. */
export type HubThemeCategory = 'glass' | 'minimal' | 'bold' | 'elegant' | 'playful' | 'nature';
export type HubThemeStyle = HubThemeCategory;
export type HubThemePreset = {
  id: string;
  name: string;
  description: string;
  category: HubThemeCategory;
  style: HubThemeStyle;
  profile: Pick<HubProfile, 'accent' | 'theme' | 'layout' | 'background'>;
  tokens: {
    paper: string;
    ink: string;
    muted: string;
    card: string;
    line: string;
    shadow: string;
    radius: string;
    backgroundImage: string;
    /** A CSS background value for the renderer's non-interactive decoration. */
    decoration: string;
  };
};

export const HUB_THEME_CATEGORIES: ReadonlyArray<{id: HubThemeCategory; label: string; description: string}> = [
  {id: 'glass', label: 'กระจกใส', description: 'แสงนุ่ม พื้นผิวโปร่ง และมิติที่พอดี'},
  {id: 'minimal', label: 'เรียบง่าย', description: 'เว้นพื้นที่ให้เนื้อหา อ่านง่ายทุกวัน'},
  {id: 'bold', label: 'เท่ชัดเจน', description: 'สีมีพลัง เส้นชัด และบุคลิกที่จำได้'},
  {id: 'elegant', label: 'สุขุม', description: 'สีลุ่มลึกและรายละเอียดที่เรียบร้อย'},
  {id: 'playful', label: 'น่ารัก', description: 'ทรงโค้ง สีอ่อน และความสนุกเล็ก ๆ'},
  {id: 'nature', label: 'ธรรมชาติ', description: 'โทนดิน ใบไม้ และพื้นที่สบายตา'},
];

export const HUB_THEMES: readonly HubThemePreset[] = [
  {
    id: 'prism-pearl', name: 'Prism Pearl', description: 'กระจกมุก แสงเย็น และการ์ดลอยเบา ๆ', category: 'glass', style: 'glass',
    profile: {accent: '#285DAC', theme: 'light', layout: 'stack', background: 'lavender'},
    tokens: {
      paper: '#EDF3F8', ink: '#203449', muted: '#506176', card: '#FFFFFF', line: '#BDCEDF',
      shadow: '0 12px 32px rgba(54,78,113,0.09), inset 0 1px 0 rgba(255,255,255,0.9)', radius: '26px',
      backgroundImage: 'radial-gradient(ellipse at 92% 6%, rgba(129,168,220,0.22), transparent 47%), radial-gradient(ellipse at 5% 68%, rgba(189,176,222,0.17), transparent 49%)',
      decoration: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(170,197,229,0.22))',
    },
  },
  {
    id: 'dusk-glass', name: 'Dusk Glass', description: 'กระจกสีค่ำ ตัดแสงฟ้าอย่างนุ่มนวล', category: 'glass', style: 'glass',
    profile: {accent: '#B5C8FF', theme: 'dark', layout: 'stack', background: 'ink'},
    tokens: {
      paper: '#161E30', ink: '#F0F5FF', muted: '#B5C3DA', card: '#1E2B42', line: '#526782',
      shadow: '0 15px 38px rgba(2,8,22,0.28), inset 0 1px 0 rgba(205,220,255,0.14)', radius: '26px',
      backgroundImage: 'radial-gradient(ellipse at 85% 2%, rgba(85,109,157,0.22), transparent 53%), radial-gradient(ellipse at 4% 73%, rgba(87,69,123,0.15), transparent 48%)',
      decoration: 'linear-gradient(140deg, rgba(172,194,241,0.25), rgba(65,78,120,0.06))',
    },
  },
  {
    id: 'amber-window', name: 'Amber Window', description: 'กระจกอุ่น เส้นเรียบ และแสงสีอำพัน', category: 'glass', style: 'glass',
    profile: {accent: '#8D5A2D', theme: 'light', layout: 'editorial', background: 'sand'},
    tokens: {
      paper: '#F7EEE3', ink: '#44372B', muted: '#6D5948', card: '#FFFCF7', line: '#DCC4A8',
      shadow: '0 12px 30px rgba(124,85,43,0.08), inset 0 1px 0 rgba(255,255,255,0.94)', radius: '22px',
      backgroundImage: 'linear-gradient(125deg, transparent 38%, rgba(237,215,177,0.27) 38%, rgba(255,255,255,0.16) 71%, transparent 71%)',
      decoration: 'linear-gradient(130deg, rgba(255,255,255,0.82), rgba(216,180,128,0.22))',
    },
  },
  {
    id: 'tide-glass', name: 'Tide Glass', description: 'เขียวทะเลโปร่งใส วางลิงก์เป็นการ์ด', category: 'glass', style: 'glass',
    profile: {accent: '#086E70', theme: 'light', layout: 'grid', background: 'mint'},
    tokens: {
      paper: '#E8F4F2', ink: '#173D40', muted: '#466467', card: '#FFFFFF', line: '#B1CFD0',
      shadow: '0 12px 30px rgba(26,97,103,0.08), inset 0 1px 0 rgba(255,255,255,0.9)', radius: '28px',
      backgroundImage: 'radial-gradient(ellipse at 3% 0%, rgba(143,202,201,0.22), transparent 50%), radial-gradient(ellipse at 100% 92%, rgba(173,201,223,0.18), transparent 53%)',
      decoration: 'linear-gradient(145deg, rgba(255,255,255,0.88), rgba(132,194,193,0.18))',
    },
  },
  {
    id: 'paper-white', name: 'Paper White', description: 'ขาวสะอาด ทุกช่องทางหาเจอในพริบตา', category: 'minimal', style: 'minimal',
    profile: {accent: '#23556B', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#F9FAFB', ink: '#20282F', muted: '#59636E', card: '#FFFFFF', line: '#CCD3DA',
      shadow: '0 2px 6px rgba(30,42,54,0.03)', radius: '12px', backgroundImage: 'none', decoration: '#E9EEF2',
    },
  },
  {
    id: 'quiet-sand', name: 'Quiet Sand', description: 'สีทรายนวลกับโครงหน้าที่เรียบสงบ', category: 'minimal', style: 'minimal',
    profile: {accent: '#7B5B45', theme: 'light', layout: 'editorial', background: 'sand'},
    tokens: {
      paper: '#F4EEE5', ink: '#413B35', muted: '#6D6055', card: '#FFFDF9', line: '#D2C6B7',
      shadow: 'none', radius: '4px', backgroundImage: 'none', decoration: '#E4D8C7',
    },
  },
  {
    id: 'mono-line', name: 'Mono Line', description: 'ขาวดำ เส้นตรง และไม่มีอะไรเกินจำเป็น', category: 'minimal', style: 'minimal',
    profile: {accent: '#24282E', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#FFFFFF', ink: '#202223', muted: '#606369', card: '#FFFFFF', line: '#373B41',
      shadow: 'none', radius: '0px', backgroundImage: 'none', decoration: '#E5E7E9',
    },
  },
  {
    id: 'slate-note', name: 'Slate Note', description: 'เทาอมฟ้า จัดผลงานเป็นหมวดหมู่ชัดเจน', category: 'minimal', style: 'minimal',
    profile: {accent: '#476875', theme: 'light', layout: 'grid', background: 'mint'},
    tokens: {
      paper: '#EDF1F4', ink: '#26343D', muted: '#53636F', card: '#F7FAFC', line: '#B7C3CB',
      shadow: 'none', radius: '8px', backgroundImage: 'none', decoration: '#D5E0E7',
    },
  },
  {
    id: 'acid-grid', name: 'Acid Grid', description: 'เขียวซิตรัส การ์ดตัดขอบ และเงาชัด', category: 'bold', style: 'bold',
    profile: {accent: '#25432C', theme: 'light', layout: 'grid', background: 'mint'},
    tokens: {
      paper: '#E4F075', ink: '#18231D', muted: '#384A24', card: '#F9FBD9', line: '#263523',
      shadow: '5px 5px 0 #263523', radius: '0px', backgroundImage: 'none', decoration: '#C4D637',
    },
  },
  {
    id: 'cobalt-club', name: 'Cobalt Club', description: 'น้ำเงินสดกับรายละเอียดสีมะนาว', category: 'bold', style: 'bold',
    profile: {accent: '#DCE75F', theme: 'dark', layout: 'stack', background: 'ink'},
    tokens: {
      paper: '#1131A0', ink: '#F3F6FF', muted: '#CDD8FF', card: '#1A369B', line: '#A6B9FF',
      shadow: '5px 6px 0 #081D65', radius: '2px', backgroundImage: 'none', decoration: '#244CC1',
    },
  },
  {
    id: 'signal-red', name: 'Signal Red', description: 'ครีมตัดแดง เส้นกรอบที่มีบุคลิก', category: 'bold', style: 'bold',
    profile: {accent: '#B73224', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#FFF2E8', ink: '#35231C', muted: '#765145', card: '#FFFAF5', line: '#40281E',
      shadow: '6px 6px 0 #DFADA1', radius: '8px', backgroundImage: 'none', decoration: '#F1CEC0',
    },
  },
  {
    id: 'night-shift', name: 'Night Shift', description: 'กราไฟต์เข้ม เลขลำดับเด่น และเส้นคม', category: 'bold', style: 'bold',
    profile: {accent: '#AFD7EC', theme: 'dark', layout: 'editorial', background: 'ink'},
    tokens: {
      paper: '#151A24', ink: '#F8F9FC', muted: '#B5C0D0', card: '#252E3F', line: '#6A7A91',
      shadow: '5px 6px 0 #080D16', radius: '4px', backgroundImage: 'none', decoration: '#35455D',
    },
  },
  {
    id: 'midnight-navy', name: 'Midnight Navy', description: 'น้ำเงินลุ่มลึก แต้มอำพันอย่างพอดี', category: 'elegant', style: 'elegant',
    profile: {accent: '#D9C393', theme: 'dark', layout: 'editorial', background: 'ink'},
    tokens: {
      paper: '#122132', ink: '#F0F1ED', muted: '#AFBDCA', card: '#1D3044', line: '#52677A',
      shadow: '0 10px 25px rgba(4,13,24,0.16)', radius: '4px', backgroundImage: 'none', decoration: '#293F54',
    },
  },
  {
    id: 'ivory-studio', name: 'Ivory Studio', description: 'สีงาช้าง รายละเอียดบาง และพื้นที่โล่ง', category: 'elegant', style: 'elegant',
    profile: {accent: '#805C33', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#F6F2EB', ink: '#383531', muted: '#6A6258', card: '#FFFDFA', line: '#C7BFB1',
      shadow: '0 6px 22px rgba(75,58,37,0.05)', radius: '12px', backgroundImage: 'none', decoration: '#E5DCCC',
    },
  },
  {
    id: 'wine-room', name: 'Wine Room', description: 'ไวน์เข้มกับสีแชมเปญ ดูอบอุ่นและสุขุม', category: 'elegant', style: 'elegant',
    profile: {accent: '#EDD1B3', theme: 'dark', layout: 'stack', background: 'ink'},
    tokens: {
      paper: '#351F29', ink: '#FBF2ED', muted: '#D5BEC6', card: '#492C38', line: '#8A6977',
      shadow: '0 10px 24px rgba(29,11,21,0.18)', radius: '6px', backgroundImage: 'none', decoration: '#5B3A45',
    },
  },
  {
    id: 'copper-letter', name: 'Copper Letter', description: 'สีทองแดงบนกระดาษ โครงหน้าแบบบรรณาธิการ', category: 'elegant', style: 'elegant',
    profile: {accent: '#8E5036', theme: 'light', layout: 'editorial', background: 'sand'},
    tokens: {
      paper: '#F1E8DF', ink: '#45342C', muted: '#715D50', card: '#FBF7F2', line: '#B9A494',
      shadow: 'none', radius: '0px', backgroundImage: 'none', decoration: '#DECCBB',
    },
  },
  {
    id: 'peach-cloud', name: 'Peach Cloud', description: 'พีชนุ่ม ขอบมน และเงาสีลูกกวาด', category: 'playful', style: 'playful',
    profile: {accent: '#9E413D', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#FFF0E9', ink: '#4B3332', muted: '#765452', card: '#FFF9F6', line: '#E6B6AA',
      shadow: '0 7px 0 #F1CFBF', radius: '32px',
      backgroundImage: 'radial-gradient(circle at 5% 8%, #FADBD0 0, #FADBD0 48px, transparent 49px), radial-gradient(circle at 95% 67%, #FBE4D5 0, #FBE4D5 62px, transparent 63px)',
      decoration: '#F1C7B8',
    },
  },
  {
    id: 'lilac-day', name: 'Lilac Day', description: 'ม่วงละมุนกับการ์ดกลมที่อยากกด', category: 'playful', style: 'playful',
    profile: {accent: '#785295', theme: 'light', layout: 'grid', background: 'lavender'},
    tokens: {
      paper: '#F0EBFA', ink: '#42345C', muted: '#695A7C', card: '#FFFAFF', line: '#C5B4DF',
      shadow: '0 6px 0 #DACDEC', radius: '28px',
      backgroundImage: 'radial-gradient(circle at 97% 4%, #E5DDF4 0, #E5DDF4 68px, transparent 69px), radial-gradient(circle at 4% 76%, #E6DFF4 0, #E6DFF4 43px, transparent 44px)',
      decoration: '#D8C8EB',
    },
  },
  {
    id: 'lemon-pop', name: 'Lemon Pop', description: 'เหลืองเลมอน สดใสแบบสบายตา', category: 'playful', style: 'playful',
    profile: {accent: '#80591B', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#FFF8D5', ink: '#473D1D', muted: '#72602B', card: '#FFFEF4', line: '#D8C56E',
      shadow: '4px 6px 0 #EADB94', radius: '22px',
      backgroundImage: 'radial-gradient(circle at 7% 11%, #F9EDB2 0, #F9EDB2 6px, transparent 7px), radial-gradient(circle at 92% 34%, #F4E5A2 0, #F4E5A2 10px, transparent 11px), radial-gradient(circle at 11% 87%, #F9EDB2 0, #F9EDB2 14px, transparent 15px)',
      decoration: '#EBD887',
    },
  },
  {
    id: 'bubble-tea', name: 'Bubble Tea', description: 'ชานมอุ่น การ์ดกลม และจุดเล็ก ๆ', category: 'playful', style: 'playful',
    profile: {accent: '#74503F', theme: 'light', layout: 'grid', background: 'sand'},
    tokens: {
      paper: '#F3E8DC', ink: '#493C35', muted: '#665447', card: '#FFFAF4', line: '#CBB5A0',
      shadow: '4px 6px 0 #DDC6B1', radius: '36px',
      backgroundImage: 'radial-gradient(circle at 6% 16%, #E1CBB6 0, #E1CBB6 5px, transparent 6px), radial-gradient(circle at 94% 39%, #E1CBB6 0, #E1CBB6 8px, transparent 9px), radial-gradient(circle at 9% 82%, #E1CBB6 0, #E1CBB6 11px, transparent 12px)',
      decoration: '#DBC3AB',
    },
  },
  {
    id: 'moss-house', name: 'Moss House', description: 'เขียวมอส โทนธรรมชาติที่ดูเป็นมิตร', category: 'nature', style: 'nature',
    profile: {accent: '#43644A', theme: 'light', layout: 'editorial', background: 'mint'},
    tokens: {
      paper: '#E9EEE3', ink: '#2D402D', muted: '#53634C', card: '#F8FAF4', line: '#B4C0A7',
      shadow: '0 6px 18px rgba(55,77,48,0.04)', radius: '18px',
      backgroundImage: 'radial-gradient(ellipse at 105% 0%, #DCE5D3 0, #DCE5D3 17%, transparent 17.3%)', decoration: '#CCD9BF',
    },
  },
  {
    id: 'sage-linen', name: 'Sage Linen', description: 'สีลินินและเสจ เรียบละมุนเหมือนกระดาษ', category: 'nature', style: 'nature',
    profile: {accent: '#5A6F4B', theme: 'light', layout: 'stack', background: 'sand'},
    tokens: {
      paper: '#F3F1E7', ink: '#3B4235', muted: '#606953', card: '#FFFDF5', line: '#C7CCBA',
      shadow: 'none', radius: '5px',
      backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent 4px, rgba(97,112,77,0.018) 4px, rgba(97,112,77,0.018) 5px)', decoration: '#DCE1CF',
    },
  },
  {
    id: 'ocean-stone', name: 'Ocean Stone', description: 'สีหินริมทะเล กับการ์ดที่วางตัวพอดี', category: 'nature', style: 'nature',
    profile: {accent: '#2F697B', theme: 'light', layout: 'grid', background: 'mint'},
    tokens: {
      paper: '#EAF0F0', ink: '#2A4248', muted: '#526971', card: '#FAFCFB', line: '#B1C4C9',
      shadow: '0 5px 15px rgba(43,82,90,0.06)', radius: '20px',
      backgroundImage: 'radial-gradient(ellipse at 0% 100%, #DDE7E7 0, #DDE7E7 22%, transparent 22.2%)', decoration: '#CCDEDF',
    },
  },
  {
    id: 'terra-arc', name: 'Terra Arc', description: 'ดินเผาและเส้นโค้ง อบอุ่นอย่างเป็นธรรมชาติ', category: 'nature', style: 'nature',
    profile: {accent: '#8E472D', theme: 'light', layout: 'editorial', background: 'sand'},
    tokens: {
      paper: '#F6E9DF', ink: '#4C382F', muted: '#74594C', card: '#FFF7EE', line: '#CDB09E',
      shadow: '0 5px 15px rgba(117,74,47,0.05)', radius: '24px',
      backgroundImage: 'radial-gradient(ellipse at 102% -4%, #EBD7C8 0, #EBD7C8 25%, transparent 25.2%)', decoration: '#DDC0AA',
    },
  },
];

const themesById = new Map(HUB_THEMES.map(theme => [theme.id, theme]));

/** Legacy profiles and the explicit custom option use the existing renderer. */
export function getHubTheme(id?: string): HubThemePreset | undefined {
  return id ? themesById.get(id) : undefined;
}

/** Apply only visual choices; identity, uploaded media and paid branding stay intact. */
export function applyHubTheme(profile: HubProfile, id: string): HubProfile {
  const selected = getHubTheme(id);
  if (!selected) throw new RangeError('ไม่พบธีมที่เลือก');
  const {accent, theme, layout, background} = selected.profile;
  return {...profile, themeId: selected.id, accent, theme, layout, background};
}

/** Safe, source-owned CSS variables. No CSS supplied by an account is interpolated. */
export function getHubThemeCssVars(profile: HubProfile): Record<string, string> {
  const selected = getHubTheme(profile.themeId);
  if (!selected) return {};
  const t = selected.tokens;
  return {
    '--hc-paper': t.paper,
    '--hc-ink': t.ink,
    '--hc-muted': t.muted,
    '--hc-card': t.card,
    '--hc-line': t.line,
    '--hc-shadow': t.shadow,
    '--hc-radius': t.radius,
    '--hc-background-image': t.backgroundImage,
    '--hc-decoration': t.decoration,
  };
}
