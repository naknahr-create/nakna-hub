"use client";

import {useMemo, useState} from "react";
import {ArrowRight, Check, ChevronDown, Eye, Layers3, LoaderCircle, Search, Sparkles, X} from "lucide-react";
import type {HubLink, HubProfile} from "../../lib/hub-types";
import {applyHubTheme, getHubTheme, HUB_THEMES, HUB_THEME_CATEGORIES, type HubThemeCategory} from "../../lib/hub-themes";
import {HubThemeThumbnail} from "./HubThemeThumbnail";
import "../theme-gallery.css";

type ThemeFilter = "recommended" | "all" | HubThemeCategory;
type Props = {
  profile: HubProfile;
  links: HubLink[];
  savedThemeId?: string;
  dirty: boolean;
  busy: boolean;
  saving: boolean;
  onChange: (profile: HubProfile) => void;
  onPreview: () => void;
};

export default function HubThemeGallery({profile, links, savedThemeId, dirty, busy, saving, onChange, onPreview}: Props) {
  const [filter, setFilter] = useState<ThemeFilter>("recommended");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selected = getHubTheme(profile.themeId);
  const recommended = useMemo(() => HUB_THEME_CATEGORIES.map(category => HUB_THEMES.find(theme => theme.category === category.id)?.id).filter(Boolean), []);
  const filtered = HUB_THEMES.filter(theme => {
    const category = HUB_THEME_CATEGORIES.find(item => item.id === theme.category);
    const match = `${theme.name} ${theme.description} ${category?.label || ""} ${category?.description || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    if (query.trim()) return match && (filter === "recommended" || filter === "all" || filter === theme.category);
    return filter === "recommended" ? recommended.includes(theme.id) : filter === "all" || filter === theme.category;
  });
  const shown = filter === "all" && !expanded && !query ? filtered.slice(0, 12) : filtered;
  const trying = selected && profile.themeId !== savedThemeId;

  function chooseFilter(value: ThemeFilter) { setFilter(value); setExpanded(false); }

  return <section className="htg-gallery" aria-labelledby="hub-theme-heading">
    <div className="htg-heading">
      <div><p className="htg-eyebrow"><Layers3 size={15} aria-hidden="true"/>THE THEME COLLECTION</p><h2 id="hub-theme-heading">เลือกสไตล์ที่เป็นคุณ<span>.</span></h2><p>ออกแบบมาให้ครบชุด เลือกที่ชอบ แล้วใส่เรื่องราวของคุณ</p></div>
      <span className="htg-count"><strong>{HUB_THEMES.length}</strong><span>ธีมพร้อมใช้</span></span>
    </div>

    <div className="htg-current">
      <span className="htg-current-mark"><Sparkles size={20} aria-hidden="true"/></span>
      <div className="htg-current-copy" role="status" aria-live="polite"><span>{trying ? "กำลังลองธีม" : "สไตล์ที่เลือก"}</span><strong>{selected?.name || "สไตล์ของคุณ"}</strong><p>{dirty ? "บันทึกฉบับร่างก่อน แล้วเผยแพร่เมื่อพร้อม" : selected ? "เลือกธีมอื่นเพื่อดูตัวอย่างได้เลย" : "เลือกธีมด้านล่างเพื่อเปลี่ยนหน้าตาทั้งชุด"}</p></div>
      <button type="button" className="hs-button hs-outline htg-preview-button" onClick={onPreview}><Eye size={17}/>ดูตัวอย่าง</button>
      <button type="submit" className="hs-button hs-primary htg-save" disabled={!dirty || busy}>{saving ? <LoaderCircle size={17} className="hs-spin"/> : <Check size={17}/>}บันทึกฉบับร่าง</button>
    </div>

    <div className="htg-tools">
      <div className="htg-filters" role="group" aria-label="หมวดธีม">
        <button type="button" aria-pressed={filter === "recommended"} onClick={() => chooseFilter("recommended")}><Sparkles size={14}/>แนะนำ</button>
        <button type="button" aria-pressed={filter === "all"} onClick={() => chooseFilter("all")}>ทั้งหมด <span>{HUB_THEMES.length}</span></button>
        {HUB_THEME_CATEGORIES.map(category => <button key={category.id} type="button" aria-pressed={filter === category.id} onClick={() => chooseFilter(category.id)}>{category.label}</button>)}
      </div>
      <label className="htg-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="ค้นหาธีม" placeholder="ค้นหาชื่อหรือสไตล์ธีม" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="ล้างการค้นหาธีม" onClick={() => setQuery("")}><X size={16}/></button>}</label>
    </div>

    <div className="htg-section-label"><p>{filter === "recommended" && !query ? "6 สไตล์ที่เราเลือกมาให้" : query ? `พบ ${filtered.length} ธีม` : filter === "all" ? "ทุกอารมณ์ ทุกตัวตน" : HUB_THEME_CATEGORIES.find(category => category.id === filter)?.description}</p><span>พรีวิวด้วยข้อมูลของคุณ</span></div>
    <div className="htg-grid" role="group" aria-label="เลือกธีมสำเร็จรูป">
      {shown.map(theme => <button key={theme.id} type="button" className={`htg-card ${profile.themeId === theme.id ? "htg-card-selected" : ""}`} aria-label={`ใช้ธีม ${theme.name} — ${theme.description}`} aria-pressed={profile.themeId === theme.id} disabled={busy} onClick={() => onChange(applyHubTheme(profile, theme.id))}>
        <div className="htg-card-art"><HubThemeThumbnail profile={profile} links={links} themeId={theme.id}/>{profile.themeId === theme.id && <span className="htg-selected-tag"><Check size={13}/>เลือกอยู่</span>}<span className="htg-try"><Eye size={14}/>ลองธีมนี้</span></div>
        <span className="htg-card-copy"><span><strong>{theme.name}</strong><span>{theme.description}</span></span><ArrowRight size={17} aria-hidden="true"/></span>
      </button>)}
    </div>
    {!shown.length && <div className="htg-empty"><Search size={24}/><h3>ยังไม่เจอธีมที่ค้นหา</h3><p>ลองค้นหาคำอื่น หรือเปิดดูธีมทั้งหมด</p><button type="button" className="hs-button hs-outline" onClick={() => {setQuery("");chooseFilter("all");}}>ดูทุกธีม</button></div>}
    {filter === "all" && !expanded && !query && filtered.length > shown.length && <button className="htg-show-more" type="button" onClick={() => setExpanded(true)}>ดูอีก {filtered.length - shown.length} ธีม<ChevronDown size={17}/></button>}
    {filter === "recommended" && !query && <button className="htg-show-more" type="button" onClick={() => chooseFilter("all")}>เปิดคลังธีมทั้งหมด {HUB_THEMES.length} แบบ<ArrowRight size={17}/></button>}
    <p className="htg-reassurance"><Check size={15} aria-hidden="true"/>เปลี่ยนธีมได้เสมอ รูป ข้อความ และลิงก์ของคุณยังอยู่ครบ</p>
  </section>;
}
