import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '检图 · 图片检测工作台', description: '批量识别检测照片中的条形码与检测项，人工校对后导出含照片的 Excel。' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
