import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'GenDX_T',
  description: '患者信息录入、设备灯态识别与本机检测历史。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
