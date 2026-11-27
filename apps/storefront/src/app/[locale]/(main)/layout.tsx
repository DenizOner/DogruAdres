import { redirect } from 'next/navigation';

import { Footer, Header } from '@/components/organisms';
import { TalkJsProvider } from '@/components/providers';
import { retrieveCustomer } from '@/lib/data/customer';
import { checkRegion } from '@/lib/helpers/check-region';

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const APP_ID = process.env.NEXT_PUBLIC_TALKJS_APP_ID;
  const { locale } = await params;

  const user = await retrieveCustomer();
  const regionCheck = await checkRegion(locale);

  if (!regionCheck) {
    return redirect('/');
  }

  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-sm focus:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
    >
      İçeriğe atla
    </a>
  );

  if (!APP_ID || !user || !user.id || !user.email)
    return (
      <>
        {skipLink}
        <Header locale={locale} />
        <div id="main-content" tabIndex={-1} className="focus:outline-none">
          {children}
        </div>
        <Footer />
      </>
    );

  const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'User';

  return (
    <TalkJsProvider
      appId={APP_ID}
      userId={user.id}
      userName={userName}
      userEmail={user.email}
    >
      {skipLink}
      <Header locale={locale} />
      <div id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </div>
      <Footer />
    </TalkJsProvider>
  );
}
