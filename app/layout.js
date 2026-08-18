import './globals.css';

export const metadata = {
  title: 'Finalize — Turn almost done into done',
  description: 'Finalize is the last-mile workspace for approvals, contracts, handoffs, signatures, payments and closeout.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
