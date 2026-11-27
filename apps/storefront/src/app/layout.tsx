import type { Metadata } from 'next';

import './globals.css';

import { Toaster } from '@medusajs/ui';

import { HtmlLangSetter } from '@/components/atoms/HtmlLangSetter/HtmlLangSetter';
import { retrieveCart } from '@/lib/data/cart';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    template: `%s | ${process.env.NEXT_PUBLIC_SITE_NAME || 'DoğruAdres'}`,
    default: process.env.NEXT_PUBLIC_SITE_NAME || 'DoğruAdres'
  },
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    'Otomotiv sektöründeki profesyonel işletmeler için kapalı B4B ticaret, tedarik ve bütünleşik çözüm platformu.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cart = await retrieveCart();

  // default lang/dir updated by HtmlLangSetter
  const htmlLang = 'tr';

  return (
    <html
      lang={htmlLang}
      dir="ltr"
      className=""
    >
      <body className="relative bg-primary text-secondary antialiased">
        <HtmlLangSetter />
        <Providers cart={cart}>{children}</Providers>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
