import type {HubBlockContent,HubContentType,HubLink} from './hub-types';

/** Stable identifiers shared by the editor, renderer and server validation. */
export const HUB_CONTENT_TYPES = ['link','heading','text','image','gallery','service','promotion'] as const;
export const HUB_GALLERY_LIMIT = 6;

export function isHubContentType(value: unknown): value is HubContentType {
  return typeof value === 'string' && (HUB_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isRichContentType(value: unknown): value is 'text'|'image'|'gallery'|'service'|'promotion' {
  return typeof value === 'string' && ['text','image','gallery','service','promotion'].includes(value);
}

/** Only an explicit outbound destination is a click action, never opening an image. */
export function hasBlockAction(block: Pick<HubLink,'type'|'url'>): boolean {
  return ['link','image','gallery','service','promotion'].includes(block.type) && !!block.url?.trim();
}

/** Media rendered by a rich block, excluding its optional small link icon. */
export function blockImageUrls(block: Pick<HubLink,'type'|'content'>): string[] {
  const content = block.content;
  if (!content) return [];
  if (block.type === 'gallery') return (content.images ?? []).map(image => image.url).filter(Boolean);
  return ['image','service','promotion'].includes(block.type) && content.imageUrl ? [content.imageUrl] : [];
}

/** Legacy records have no content object; new records are validated before storage. */
export function readBlockContent(value: string | null | undefined): HubBlockContent | undefined {
  if (!value) return undefined;
  try {
    const content: unknown = JSON.parse(value);
    if (!content || typeof content !== 'object' || Array.isArray(content) || !Object.keys(content).length) return undefined;
    return content as HubBlockContent;
  } catch {return undefined;}
}
