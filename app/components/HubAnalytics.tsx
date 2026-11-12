"use client";

import {useEffect, useId, useRef, useState} from "react";
import {ArrowDownToLine, ArrowUpRight, BarChart3, ChevronRight, Eye, Info, Link2, LoaderCircle, MousePointer2, RefreshCw, ShieldCheck, Sparkles, X} from "lucide-react";
import type {AnalyticsData, AnalyticsRange, PageSummary} from "../../lib/hub-types";
import {HubLinkIcon} from "./HubLinkIcon";
import "../analytics.css";

const number = new Intl.NumberFormat("th-TH");
const ratio = new Intl.NumberFormat("th-TH", {maximumFractionDigits: 1});
const RANGES: {value: AnalyticsRange; label: string}[] = [
  {value: "today", label: "วันนี้"}, {value: "7d", label: "7 วัน"},
  {value: "30d", label: "30 วัน"}, {value: "all", label: "ทั้งหมด"},
];
type BreakdownRow = {name: string; count: number};
type TrendDay = {date: string; clicks: number; views?: number};
type LinkDetail = NonNullable<AnalyticsData["selectedLink"]>;

function percentage(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${ratio.format(value)}%` : "—";
}
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("th-TH", {day: "numeric", month: "short", timeZone: "Asia/Bangkok"}).format(new Date(`${date}T00:00:00+07:00`));
}
function clockLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("th-TH", {hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok"}).format(timestamp);
}
function domainOf(url: string): string {
  try {const value = new URL(url); return value.protocol === "mailto:" ? value.pathname : value.hostname.replace(/^www\./, "");}
  catch {return "ลิงก์ที่บันทึกไว้";}
}
function chartDays<T extends TrendDay>(daily: T[], range: AnalyticsRange): TrendDay[] {
  if (range !== "all") return daily;
  // All-time totals remain all-time. The chart uses a continuous 90-day window,
  // so missing dates never appear as adjacent days with invented traffic.
  const end = Math.floor((Date.now() + 7 * 3_600_000) / 86_400_000) * 86_400_000;
  const byDate = new Map(daily.map(day => [day.date, day]));
  return Array.from({length: 90}, (_, index) => {
    const date = new Date(end - (89 - index) * 86_400_000).toISOString().slice(0, 10);
    return byDate.get(date) ?? {date, clicks: 0, views: 0};
  });
}
async function getAnalytics(pageId: string, range: AnalyticsRange, signal: AbortSignal, linkId?: string): Promise<AnalyticsData> {
  const query = new URLSearchParams({range});
  if (linkId) query.set("linkId", linkId);
  const response = await fetch(`/api/pages/${encodeURIComponent(pageId)}/analytics?${query}`, {cache: "no-store", signal});
  const result = await response.json().catch(() => null) as AnalyticsData & {error?: string} | null;
  if (!response.ok || !result) throw new Error(result?.error || "โหลดสถิติไม่สำเร็จ กรุณาลองอีกครั้ง");
  return result;
}

export default function HubAnalytics({page, notify, initialLinkId}: {
  page: PageSummary; notify: (message: string) => void; initialLinkId?: string;
}) {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{key: string; data: AnalyticsData | null; error: string; updatedAt: number}>({key: "", data: null, error: "", updatedAt: 0});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const selectionKey = `${page.id}:${initialLinkId ?? ""}`;
  const [selection, setSelection] = useState({key: selectionKey, id: initialLinkId ?? ""});
  const selectedId = selection.key === selectionKey ? selection.id : initialLinkId ?? "";
  const setSelectedId = (id: string) => setSelection({key: selectionKey, id});
  const [detailResult, setDetailResult] = useState<{key: string; detail: LinkDetail | null; error: string}>({key: "", detail: null, error: ""});
  const queryKey = `${page.id}:${range}:${refresh}`;
  const loading = result.key !== queryKey;
  const data = loading ? null : result.data;
  const error = loading ? "" : result.error;
  const updatedAt = data ? result.updatedAt : 0;
  const detailKey = `${queryKey}:${selectedId}`;
  const detailLoading = !!selectedId && detailResult.key !== detailKey;
  const detail = detailResult.key === detailKey ? detailResult.detail : null;
  const detailError = detailResult.key === detailKey ? detailResult.error : "";
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAnalytics(page.id, range, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({key: queryKey, data: value, error: "", updatedAt: Date.now()});
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({key: queryKey, data: null, error: cause instanceof Error ? cause.message : "โหลดสถิติไม่สำเร็จ", updatedAt: 0});
    });
    return () => controller.abort();
  }, [page.id, range, queryKey]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void getAnalytics(page.id, range, controller.signal, selectedId).then(value => {
      if (!controller.signal.aborted) {
        if (!value.selectedLink) throw new Error("ไม่พบสถิติของลิงก์นี้");
        setDetailResult({key: detailKey, detail: value.selectedLink, error: ""});
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setDetailResult({key: detailKey, detail: null, error: cause instanceof Error ? cause.message : "โหลดสถิติลิงก์ไม่สำเร็จ"});
    });
    return () => controller.abort();
  }, [page.id, range, selectedId, detailKey]);
  useEffect(() => {
    if (selectedId) detailRef.current?.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
  }, [selectedId, loading]);

  async function exportCsv(linkId?: string) {
    setExporting(true); setExportError("");
    try {
      const query = new URLSearchParams({range});
      if (linkId) query.set("linkId", linkId);
      const response = await fetch(`/api/pages/${encodeURIComponent(page.id)}/export?${query}`, {cache: "no-store"});
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as {error?: string};
        throw new Error(result.error || "ส่งออกรายงานไม่สำเร็จ");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `nakna-hub-${page.slug}-${range}${linkId ? "-link" : ""}.csv`;
      anchor.hidden = true; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      notify("เริ่มดาวน์โหลดรายงาน CSV แล้ว");
    } catch (cause) {setExportError(cause instanceof Error ? cause.message : "ส่งออกรายงานไม่สำเร็จ");}
    finally {setExporting(false);}
  }

  const top = data?.ranking.find(row => row.clicks > 0);
  const largest = Math.max(1, ...(data?.ranking.map(row => row.clicks) ?? []));
  return <section className="ha-analytics" aria-label="สถิติฮับ">
    <header className="ha-heading">
      <div><p className="ha-eyebrow">ภาพรวมของฮับ</p><h2>สถิติการเข้าชมและลิงก์</h2><p>รู้ว่าคนเปิดฮับแค่ไหน และลิงก์ไหนพาคนไปต่อ</p></div>
      <button className="ha-button ha-export" aria-label="ส่งออกสถิติทุกลิงก์เป็น CSV" data-tooltip="ดาวน์โหลดสถิติในช่วงเวลาที่เลือก เปิดต่อใน Excel หรือ Sheets ได้" disabled={loading || !data || exporting} onClick={() => void exportCsv()}>
        {exporting ? <LoaderCircle size={17} className="hs-spin"/> : <ArrowDownToLine size={17}/>}ส่งออก CSV
      </button>
    </header>

    {!page.published && <div className="ha-notice"><Info size={19}/><div><strong>ฮับนี้ยังไม่เปิดให้ผู้เข้าชม</strong><p>กดเผยแพร่ฮับแล้วแชร์ลิงก์ เพื่อเริ่มรับการเข้าชมจริง ประวัติเดิมยังคงอยู่</p></div></div>}

    <div className="ha-toolbar">
      <div className="ha-ranges" role="group" aria-label="ช่วงเวลาสถิติ">
        {RANGES.map(item => <button key={item.value} type="button" aria-pressed={range === item.value} className={range === item.value ? "is-selected" : ""} onClick={() => setRange(item.value)}>{item.label}</button>)}
      </div>
      <div className="ha-freshness"><span>{updatedAt && !loading ? `อัปเดต ${clockLabel(updatedAt)} · เวลาไทย` : "เวลาไทย (UTC+7)"}</span><button className="ha-refresh" type="button" aria-label="รีเฟรชสถิติ" data-tooltip="โหลดตัวเลขล่าสุดในช่วงเวลาที่เลือก" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} className={loading ? "hs-spin" : ""}/></button></div>
    </div>
    {exportError && <div className="ha-error" role="alert"><span>{exportError}</span><button onClick={() => setExportError("")} aria-label="ปิดข้อความส่งออกไม่สำเร็จ"><X size={16}/></button></div>}

    {error ? <div className="ha-load-state ha-load-error" role="alert"><BarChart3 size={30}/><h3>ยังโหลดสถิติไม่ได้</h3><p>{error}</p><button className="ha-button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/>ลองอีกครั้ง</button></div>
      : loading || !data ? <div className="ha-load-state" role="status"><LoaderCircle size={26} className="hs-spin"/><p>กำลังอ่านสถิติของฮับ</p></div>
      : <>
        <div className="ha-metrics">
          <article><span className="ha-metric-label">เข้าชมฮับ<Eye size={18}/></span><strong>{number.format(data.totalViews)}<small>ครั้ง</small></strong><p>นับการเปิดหน้า ไม่ใช่จำนวนคน</p></article>
          <article><span className="ha-metric-label">คลิกลิงก์<MousePointer2 size={18}/></span><strong>{number.format(data.totalClicks)}<small>ครั้ง</small></strong><p>รวมทุกลิงก์ในช่วงที่เลือก</p></article>
          <article className="ha-metric-rate"><span className="ha-metric-label">คลิกต่อการเข้าชม<ArrowUpRight size={18}/></span><strong>{percentage(data.clickRate)}</strong><p>{data.totalViews ? "คลิกรวม ÷ ครั้งที่เข้าชม × 100" : "รอข้อมูลการเข้าชมเพื่อคำนวณ"}</p></article>
          <article className="ha-metric-top"><span className="ha-metric-label">ลิงก์ที่คลิกมากที่สุด<Sparkles size={18}/></span>{top ? <><button className="ha-top-link" onClick={() => setSelectedId(top.id)}>{top.title}<ChevronRight size={17}/></button><p>{number.format(top.clicks)} คลิก · {percentage(top.share)} ของคลิกทั้งหมด</p></> : <><strong className="ha-no-top">ยังไม่มีคลิก</strong><p>อันดับจะปรากฏเมื่อมีการคลิก</p></>}</article>
        </div>

        <details className="ha-rate-help"><summary><Info size={15}/>วิธีอ่านอัตราคลิกและสัดส่วนคลิก</summary><p><strong>คลิกต่อการเข้าชม</strong> = จำนวนครั้งที่คลิก ÷ จำนวนครั้งที่เปิดฮับ × 100 เช่น เปิดฮับ 100 ครั้ง คลิก 35 ครั้ง เท่ากับ 35% ค่านี้อาจเกิน 100% เมื่อมีการคลิกหลายลิงก์หรือคลิกซ้ำ จึงไม่ใช่สัดส่วนของคนไม่ซ้ำ ส่วน <strong>สัดส่วนคลิก</strong> = คลิกของลิงก์นั้น ÷ คลิกรวมทุกลิงก์ × 100</p></details>

        <section className="ha-panel ha-trend-panel">
          <div className="ha-panel-heading"><div><h3>การเข้าชมและคลิกในแต่ละวัน</h3><p>{range === "all" ? "กราฟแสดง 90 วันล่าสุด · ตัวเลขรวมด้านบนเป็นข้อมูลทั้งหมด" : "เทียบการเปิดฮับกับการคลิกลิงก์ในช่วงที่เลือก"}</p></div><span className="ha-count-tag"><Link2 size={13}/>{number.format(data.activeLinks)} ลิงก์เปิดใช้งาน</span></div>
          <TrendChart rows={chartDays(data.daily, range)} showViews emptyTitle="ยังไม่มีการเข้าชมหรือคลิกในช่วงนี้"/>
        </section>

        <section className="ha-panel ha-ranking">
          <div className="ha-panel-heading"><div><h3>ลิงก์ไหนคนสนใจมากที่สุด</h3><p>เรียงตามจำนวนคลิก เลือกแต่ละลิงก์เพื่อดูรายละเอียด</p></div><span className="ha-count-tag">{number.format(data.ranking.length)} ลิงก์</span></div>
          {data.ranking.length ? <><p className="ha-table-hint">เลื่อนตารางซ้าย–ขวาเพื่อดูข้อมูลครบ</p><div className="ha-table-scroll" tabIndex={0} role="region" aria-label="ตารางสถิติของแต่ละลิงก์"><table>
            <thead><tr><th scope="col">ลิงก์</th><th scope="col">คลิก</th><th scope="col">คลิก / เข้าชม</th><th scope="col">สัดส่วนคลิก</th><th scope="col"><span className="hs-sr-only">รายละเอียด</span></th></tr></thead>
            <tbody>{data.ranking.map((row, index) => <tr key={row.id} className={selectedId === row.id ? "is-selected" : ""}>
              <th scope="row"><div className="ha-link-cell"><span className="ha-rank-number">{String(index + 1).padStart(2, "0")}</span><span className="ha-link-icon"><HubLinkIcon icon={row.icon} url={row.url} size={21}/></span><div><button className="ha-link-title" onClick={() => setSelectedId(row.id)}>{row.title}</button><span className="ha-link-domain">{domainOf(row.url)}{row.archived ? <em>ในคลัง</em> : !row.enabled ? <em>ซ่อนในฉบับร่าง</em> : null}</span><span className="ha-rank-track" aria-hidden="true"><i style={{width: `${row.clicks / largest * 100}%`}}/></span></div></div></th>
              <td className="ha-clicks-cell" data-label="คลิก">{number.format(row.clicks)}</td><td data-label="คลิก / เข้าชม">{percentage(row.clickRate)}</td><td data-label="สัดส่วนคลิก">{percentage(row.share)}</td><td><button className="ha-detail-button" aria-label={`ดูสถิติลิงก์ ${row.title}`} aria-expanded={selectedId === row.id} aria-controls="ha-link-detail" onClick={() => setSelectedId(row.id)}>ดูรายละเอียด<ChevronRight size={15}/></button></td>
            </tr>)}</tbody>
          </table></div><p className="ha-table-note">อัตรารายลิงก์เทียบกับการเปิดฮับทั้งหมดในช่วงเดียวกัน รวมประวัติของลิงก์ในคลัง</p></> : <div className="ha-empty"><Link2 size={27}/><h4>เพิ่มลิงก์แรกเพื่อเริ่มดูสถิติ</h4><p>เมื่อมีลิงก์ ตารางนี้จะแสดงยอดคลิกและอัตราของแต่ละรายการ</p></div>}
        </section>

        {selectedId && <section className="ha-panel ha-link-detail" id="ha-link-detail" ref={detailRef} aria-label="รายละเอียดสถิติลิงก์">
          <div className="ha-panel-heading"><div><p className="ha-eyebrow">เจาะลึกแต่ละลิงก์</p><h3>{detail?.title || "สถิติรายลิงก์"}</h3>{detail && <p>{domainOf(detail.url)}</p>}</div><button className="ha-close-detail" onClick={() => setSelectedId("")} aria-label="ปิดรายละเอียดลิงก์"><X size={19}/></button></div>
          {detailLoading ? <div className="ha-detail-loading" role="status"><LoaderCircle size={21} className="hs-spin"/>กำลังอ่านสถิติลิงก์</div> : detailError ? <div className="ha-error" role="alert"><span>{detailError}</span><button onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div> : detail && <>
            <div className="ha-detail-metrics"><div><span>คลิกลิงก์นี้</span><strong>{number.format(detail.clicks)}<small>ครั้ง</small></strong></div><div><span>คลิกต่อการเข้าชมฮับ</span><strong>{percentage(detail.clickRate)}</strong></div><div><span>สัดส่วนจากคลิกทั้งหมด</span><strong>{percentage(detail.share)}</strong></div></div>
            <div className="ha-detail-chart-heading"><h4>คลิกของลิงก์นี้ในแต่ละวัน</h4><button className="ha-button" disabled={exporting} onClick={() => void exportCsv(selectedId)}>{exporting ? <LoaderCircle size={14} className="hs-spin"/> : <ArrowDownToLine size={14}/>}CSV ลิงก์นี้</button></div>
            {range === "all" && <p className="ha-detail-caption">กราฟแสดง 90 วันล่าสุด · ตัวเลขรวมเป็นข้อมูลทั้งหมด</p>}
            <TrendChart rows={chartDays(detail.daily, range)} emptyTitle="ลิงก์นี้ยังไม่มีคลิกในช่วงที่แสดง"/>
            <div className="ha-breakdowns ha-detail-breakdowns"><Breakdown title="อุปกรณ์ที่คลิกลิงก์นี้" rows={detail.devices} unit="คลิก"/><Breakdown title="แหล่งที่มาของคลิกลิงก์นี้" rows={detail.sources} unit="คลิก"/></div>
          </>}
        </section>}

        <div className="ha-breakdowns"><Breakdown title="คนคลิกผ่านอุปกรณ์อะไร" rows={data.devices} unit="คลิก"/><Breakdown title="การเข้าชมฮับมาจากไหน" rows={data.sources} unit="ครั้งที่เข้าชม"/></div>
        <footer className="ha-footnote"><ShieldCheck size={17}/><div><strong>สถิติมาจากการใช้งานจริง</strong><p>นับเป็นครั้ง อาจรวมการกดซ้ำของคนเดิม · ไม่นับการใช้งานจากบัญชีเจ้าของ พรีวิว และบอตที่ระบบตรวจพบ</p></div></footer>
      </>}
  </section>;
}

function TrendChart({rows, showViews = false, emptyTitle}: {rows: TrendDay[]; showViews?: boolean; emptyTitle: string}) {
  const chartId = useId();
  const [activeDate, setActiveDate] = useState("");
  const [mode, setMode] = useState<"both" | "clicks" | "views">("both");
  const visibleMode = showViews ? mode : "clicks";
  const showClicks = visibleMode !== "views", renderViews = showViews && visibleMode !== "clicks";
  const active = rows.find(row => row.date === activeDate) ?? rows[rows.length - 1];
  const hasData = rows.some(row => row.clicks > 0 || (showViews && (row.views ?? 0) > 0));
  const maxValue = Math.max(1, ...rows.map(row => Math.max(showClicks ? row.clicks : 0, renderViews ? row.views ?? 0 : 0)));
  const stepValue = Math.max(1, Math.ceil(maxValue / 4));
  const ceiling = stepValue * 4;
  const step = 694 / Math.max(1, rows.length);
  const barWidth = Math.max(1, Math.min(28, step * (showClicks && renderViews ? .32 : .58)));
  const hasTwo = showClicks && renderViews;
  return <div className="ha-chart-area">
    <div className="ha-chart-controls"><div className="ha-chart-legend" role="group" aria-label="ข้อมูลที่แสดงบนกราฟ">
      {showViews ? <>{([{id: "both", label: "ทั้งสองรายการ"}, {id: "views", label: "เข้าชม"}, {id: "clicks", label: "คลิก"}] as const).map(item => <button key={item.id} aria-pressed={mode === item.id} onClick={() => setMode(item.id)} className={mode === item.id ? "is-selected" : ""}>{item.id !== "both" && <i className={`ha-key-${item.id}`}/>} {item.label}</button>)}</> : <span><i className="ha-key-clicks"/>จำนวนคลิก</span>}
    </div>{hasData && <label className="ha-chart-date"><span className="hs-sr-only">เลือกวันที่ในกราฟ</span><select aria-label="เลือกวันที่ในกราฟ" value={active?.date ?? ""} onChange={event => setActiveDate(event.target.value)}>{rows.map(row => <option key={row.date} value={row.date}>{shortDate(row.date)}</option>)}</select></label>}</div>
    {!hasData ? <div className="ha-chart-empty"><BarChart3 size={30}/><h4>{emptyTitle}</h4><p>ข้อมูลจริงจะแสดงเมื่อมีคนเปิดฮับและกดลิงก์</p></div> : <>
      <div className="ha-chart-scroll"><svg className="ha-chart" viewBox="0 0 760 235" role="img" aria-labelledby={chartId}>
        <title id={chartId}>{showViews ? "กราฟการเข้าชมและคลิกรายวัน" : "กราฟคลิกรายวัน"} เลือกวันที่ด้านบนเพื่ออ่านค่าตัวเลข</title>
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="45" x2="747" y1={188 - tick / 4 * 160} y2={188 - tick / 4 * 160} stroke="#e0e9ec" strokeDasharray={tick ? "4 5" : undefined}/><text x="34" y={192 - tick / 4 * 160} textAnchor="end">{number.format(stepValue * tick)}</text></g>)}
        {rows.map((row, index) => {
          const center = 49 + index * step + step / 2;
          const clicksHeight = row.clicks / ceiling * 160;
          const viewsHeight = (row.views ?? 0) / ceiling * 160;
          const selected = active?.date === row.date;
          return <g key={row.date} onPointerEnter={() => setActiveDate(row.date)} onClick={() => setActiveDate(row.date)}>
            <title>{`${shortDate(row.date)}: ${showViews ? `${number.format(row.views ?? 0)} ครั้งที่เข้าชม, ` : ""}${number.format(row.clicks)} คลิก`}</title>
            <rect x={center - step / 2} y="20" width={step} height="172" fill={selected ? "#edf5f6" : "transparent"}/>
            {renderViews && <rect x={center - (hasTwo ? barWidth + 1 : barWidth / 2)} y={188 - viewsHeight} width={barWidth} height={viewsHeight} rx={Math.min(3, barWidth / 3)} fill="#8b79ca"/>}
            {showClicks && <rect x={center + (hasTwo ? 1 : -barWidth / 2)} y={188 - clicksHeight} width={barWidth} height={clicksHeight} rx={Math.min(3, barWidth / 3)} fill="#087f83"/>}
            {(index === 0 || index === rows.length - 1 || (index % Math.max(1, Math.ceil(rows.length / 5)) === 0 && index < rows.length - 2)) && <text x={center} y="218" textAnchor="middle">{Number(row.date.slice(8))}/{Number(row.date.slice(5, 7))}</text>}
          </g>;
        })}
      </svg></div>
      <div className="ha-chart-readout" aria-live="polite"><span>{active ? shortDate(active.date) : ""}</span>{showViews && <span><i className="ha-key-views"/>เข้าชม <strong>{number.format(active?.views ?? 0)}</strong></span>}<span><i className="ha-key-clicks"/>คลิก <strong>{number.format(active?.clicks ?? 0)}</strong></span><small>แตะกราฟหรือเลือกวันที่เพื่อดูยอด</small></div>
    </>}
  </div>;
}

function Breakdown({title, rows, unit}: {title: string; rows: BreakdownRow[]; unit: string}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <section className="ha-panel ha-breakdown"><div className="ha-panel-heading"><div><h3>{title}</h3><p>{number.format(total)} {unit} ในช่วงที่เลือก</p></div></div>
    {!total ? <p className="ha-breakdown-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</p> : <ul>{rows.map(row => <li key={row.name}><div><span>{row.name}</span><strong>{number.format(row.count)}<small>{percentage(row.count / total * 100)}</small></strong></div><span className="ha-breakdown-track" aria-hidden="true"><i style={{width: `${row.count / total * 100}%`}}/></span></li>)}</ul>}
  </section>;
}
