"use client";

import {useEffect, useId, useRef, useState} from "react";
import {createPortal} from "react-dom";
import "../tooltips.css";

type Tip = {anchor: HTMLElement; text: string; x: number; y: number; above: boolean};

/** One tooltip layer keeps hints outside cards and scroll containers. */
export default function HubTooltips() {
  const id = useId();
  const [tip, setTip] = useState<Tip | null>(null);
  const active = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let keyboard = false;
    let dismissed: HTMLElement | null = null;
    const hide = () => {clearTimeout(timer); active.current = null; setTip(null);};
    const control = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const element = target.closest<HTMLElement>('[data-tooltip],button,a,[role="switch"]');
      return element?.closest('.hs-shell') ? element : null;
    };
    const show = (element: HTMLElement | null, immediate = false) => {
      if (!element || element === dismissed || element.dataset.tooltip === "off") {hide(); return;}
      if (active.current === element) return;
      hide(); active.current = element;
      const text = element.dataset.tooltip || element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.replace(/\s+/g, ' ').trim();
      if (!text) return;
      timer = setTimeout(() => {
        if (!element.isConnected) return;
        const rect = element.getBoundingClientRect();
        const width = Math.min(280, window.innerWidth - 24);
        const above = rect.top > 100;
        setTip({anchor: element, text, x: Math.max(12 + width / 2, Math.min(window.innerWidth - 12 - width / 2, rect.left + rect.width / 2)), y: above ? rect.top - 9 : rect.bottom + 9, above});
      }, immediate ? 0 : 260);
    };
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      keyboard = false;
      const element = control(event.target);
      if (dismissed !== element) dismissed = null;
      show(element);
    };
    const pointerOut = (event: PointerEvent) => {
      if (active.current?.contains(event.relatedTarget as Node | null)) return;
      dismissed = null; hide();
    };
    const focusIn = (event: FocusEvent) => {if (keyboard) show(control(event.target), true);};
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {keyboard = true; dismissed = null;}
      if (event.key === 'Escape') {dismissed = active.current; hide();}
    };
    document.addEventListener('pointerover', pointerOver, true);
    document.addEventListener('pointerout', pointerOut, true);
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', pointerOver, true);
      document.removeEventListener('pointerout', pointerOut, true);
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  useEffect(() => {
    if (!tip) return;
    const previous = tip.anchor.getAttribute('aria-describedby');
    tip.anchor.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => {if (previous) tip.anchor.setAttribute('aria-describedby', previous); else tip.anchor.removeAttribute('aria-describedby');};
  }, [tip, id]);
  if (!tip) return null;
  return createPortal(<div id={id} className={`ht-tooltip ${tip.above ? 'ht-tooltip-above' : ''}`} role="tooltip" style={{left: tip.x, top: tip.y}}>{tip.text}</div>, document.body);
}
