import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '检图 · 设备灯态检测',
  description:
    '识别试管条形码与四路设备指示灯，查看定位标注，校对并导出 Excel。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
