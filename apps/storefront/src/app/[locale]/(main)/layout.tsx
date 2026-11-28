import { redirect } from 'next/navigation';

import {
  MainContentTarget,
  SkipToMainContent
} from '@/components/atoms/SkipToMainContent/SkipToMainContent';
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

  if (!APP_ID || !user || !user.id || !user.email)
    return (
      <>
        <SkipToMainContent />
        <Header locale={locale} />
        <MainContentTarget>{children}</MainContentTarget>
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
      <SkipToMainContent />
      <Header locale={locale} />
      <MainContentTarget>{children}</MainContentTarget>
      <Footer />
    </TalkJsProvider>
  );
}
