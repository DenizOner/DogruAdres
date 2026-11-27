'use client';

import { useEffect } from 'react';

import { usePathname } from 'next/navigation';

import { toHreflang } from '@/lib/helpers/hreflang';

export function getDocumentDirection(locale: string): 'rtl' | 'ltr' {
  return locale.trim().toLowerCase().startsWith('ar') ? 'rtl' : 'ltr';
}

export function HtmlLangSetter() {
  const pathname = usePathname();

  useEffect(() => {
    const localeMatch = pathname?.match(/^\/([a-z]{2})(?:\/|$)/i);
    const locale = localeMatch?.[1] || 'tr';
    const htmlLang = toHreflang(locale);
    const dir = getDocumentDirection(locale);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = htmlLang;
      document.documentElement.dir = dir;
    }
  }, [pathname]);

  return null;
}
