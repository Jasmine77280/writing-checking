import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '文思进阶 · 让论证更有力量', description: '高中议论文论证能力训练工作台' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
