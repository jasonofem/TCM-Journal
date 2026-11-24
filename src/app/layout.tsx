import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Titan Capital Markets — Trading Journal & Firm Desk',
  description:
    'Institutional trading journal with automated MT4/MT5 HTML & Excel trade ingestion, deduplication, live risk analytics, and multi-desk Firm Command.',
  icons: {
    icon: '/tcm-logo.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#08090c] text-[#f3f1ec] selection:bg-[#c8a55b]/30 selection:text-[#f8e7bc]">
        {children}
      </body>
    </html>
  );
}
