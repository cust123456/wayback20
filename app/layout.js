import './globals.css';

export const metadata = {
  title: 'Wayback Domain History Checker',
  description: 'Check domain age, history and spam risk via Wayback Machine',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
