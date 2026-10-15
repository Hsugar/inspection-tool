'use client';
/* oxlint-disable next/no-img-element -- Offline local brand assets. */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Home,
  UserRound,
  ShieldCheck,
  Languages,
  Info,
} from 'lucide-react';
export type Language = 'en' | 'zh';
export type AppPage =
  | 'home'
  | 'entry'
  | 'result'
  | 'history'
  | 'detail'
  | 'mine';
export const APP_VERSION = '1.1.0';
export function Brand({ className = '' }: { className?: string }) {
  return (
    <img
      className={`gendx-brand ${className}`}
      src="/brand/gendx-logo-compact.png"
      alt="GenDx · Infection POCT Innovator"
    />
  );
}
export function BottomNavigation({
  page,
  language,
  disabled,
  onNavigate,
}: {
  page: AppPage;
  language: Language;
  disabled: boolean;
  onNavigate: (page: AppPage) => void;
}) {
  const zh = language === 'zh';
  return (
    <nav
      className="bottom-navigation"
      aria-label={zh ? '主导航' : 'Main navigation'}
    >
      <div className="bottom-navigation-items">
        {(
          [
            { id: 'history', label: zh ? '历史' : 'History', icon: Clock3 },
            { id: 'home', label: zh ? '首页' : 'Home', icon: Home },
            { id: 'mine', label: zh ? '我的' : 'Settings', icon: UserRound },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            disabled={disabled}
            className={`navigation-item ${id === 'home' ? 'nav-home' : ''} ${page === id || (id === 'home' && ['entry', 'result'].includes(page)) || (id === 'history' && page === 'detail') ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
            aria-current={page === id ? 'page' : undefined}
          >
            <span className="navigation-icon">
              <Icon size={23} strokeWidth={1.7} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
export function HomeOverview({
  language,
  disabled,
  count,
  onStart,
  onHistory,
}: {
  language: Language;
  disabled: boolean;
  count: number;
  onStart: () => void;
  onHistory: () => void;
}) {
  const zh = language === 'zh';
  return (
    <section className="gendx-home">
      <div className="home-copy">
        <h1>
          {zh ? (
            <>
              每一次检测，
              <br />
              清晰记录。
            </>
          ) : (
            <>
              Every test.
              <br />
              Clearly recorded.
            </>
          )}
        </h1>
        <p>
          {zh
            ? '录入患者信息，拍摄设备指示灯，查看并保存本次检测记录。'
            : 'Enter patient information, capture the device, and keep each result together.'}
        </p>
        <div className="home-flow">
          <span>01 {zh ? '录入' : 'Enter'}</span>
          <i />
          <span>02 {zh ? '拍照' : 'Capture'}</span>
          <i />
          <span>03 {zh ? '结果' : 'Result'}</span>
        </div>
        <button
          className="button primary enter-button"
          disabled={disabled}
          onClick={onStart}
        >
          <span>{zh ? '开始检测' : 'Enter'}</span>
          <ArrowRight size={21} />
        </button>
        <button className="history-link" onClick={onHistory}>
          <Clock3 size={16} />
          {zh
            ? `查看本机历史 · ${count} 条`
            : `Local history · ${count} records`}
          <ChevronRight size={15} />
        </button>
      </div>
      <div
        className="product-scene"
        aria-label={
          zh ? 'GenDx 检测设备示意' : 'GenDx detection device reference'
        }
      >
        <div className="product-halo" />
        <div className="product-window">
          <img
            src="/gendx-device.png"
            alt={zh ? 'GenDx 检测设备' : 'GenDx detection device'}
          />
        </div>
      </div>
    </section>
  );
}
export function MyPage({
  language,
  onLanguage,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
}) {
  const zh = language === 'zh';
  const [info, setInfo] = useState<'privacy' | 'about' | null>(null);
  return (
    <section className="settings-page">
      <div className="page-heading">
        <span className="eyebrow">PREFERENCES</span>
        <h1>{zh ? '我的设置' : 'Settings'}</h1>
      </div>
      <div className="app-identity">
        <Brand />
        <strong>GenDX_T</strong>
        <span>
          {zh ? '版本' : 'Version'} {APP_VERSION}
        </span>
      </div>
      <div className="settings-list">
        <label className="settings-row">
          <Languages size={21} />
          <strong>{zh ? '语言' : 'Language'}</strong>
          <select
            aria-label="Language / 语言"
            value={language}
            onChange={(e) => onLanguage(e.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="zh">简体中文</option>
          </select>
        </label>
        <button className="settings-row" onClick={() => setInfo('privacy')}>
          <ShieldCheck size={21} />
          <strong>{zh ? '隐私说明' : 'Privacy'}</strong>
          <ChevronRight size={18} />
        </button>
        <button className="settings-row" onClick={() => setInfo('about')}>
          <Info size={21} />
          <strong>{zh ? '关于 GenDX_T' : 'About GenDX_T'}</strong>
          <ChevronRight size={18} />
        </button>
      </div>
      <Dialog
        open={!!info}
        onOpenChange={(value) => {
          if (!value) setInfo(null);
        }}
      >
        <DialogContent className="information-dialog">
          <Brand />
          <DialogTitle>
            {info === 'privacy' ? (zh ? '隐私说明' : 'Privacy') : 'GenDX_T'}
          </DialogTitle>
          <DialogDescription>
            {info === 'privacy'
              ? zh
                ? '患者信息、照片和检测结果仅在本机处理并保存。本版本无账户、无后台、无信息上传。仅当您主动保存或分享导出文件时，数据才会交给您选择的位置或应用。导出文件包含患者信息，请妥善保管。'
                : 'Patient information, photos and results are processed and stored on this device. There is no account, server or upload. Data leaves the app only when you choose to save or share an export. Exports contain patient information; store them carefully.'
              : zh
                ? '适用于样例中的 GenDx 蓝盖四灯设备。Negative、Positive、Invalid 互斥；Power 仅展示。无法可靠判断的灯态保留为待确认。导出格式支持 Excel、CSV、HL7 v2 和 FHIR。设备灯态指示不能单独替代临床诊断。'
                : 'For the reference GenDx device with a blue cap and four indicators. Negative, Positive and Invalid are mutually exclusive. Power is display-only. Uncertain readings remain unresolved. Supports Excel, CSV, HL7 v2 and FHIR exports. Device indications alone do not establish a clinical diagnosis.'}
          </DialogDescription>
          <button className="button secondary" onClick={() => setInfo(null)}>
            {zh ? '关闭' : 'Close'}
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
