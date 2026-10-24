import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'WriteWise · 高考英语写作批改与提升', description: '应用文与读后续写智能批改、分层修改指导和教师复核' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
