'use client';
/* oxlint-disable next/no-img-element -- Local blob thumbnails are shared with offline Android and do not use an image server. */
import { useState } from 'react';
import {
  ArrowRight,
  Camera,
  ChevronRight,
  CircleHelp,
  ClipboardPenLine,
  FileClock,
  Home,
  Images,
  Info,
  Languages,
  ScanLine,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { conclude, needsReview, type Inspection } from '@/lib/inspection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export type AppPage = 'home' | 'entry' | 'capture' | 'mine';

const pages = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'entry', label: '录入', icon: ClipboardPenLine },
  { key: 'capture', label: '拍照', icon: Camera },
  { key: 'mine', label: '我的', icon: UserRound },
] as const;

export function BottomNavigation({
  current,
  onNavigate,
}: {
  current: AppPage;
  onNavigate: (page: AppPage) => void;
}) {
  return (
    <nav className="bottom-navigation" aria-label="主导航">
      <div className="bottom-navigation-items">
        {pages.map(({ key, label, icon: Icon }) => (
          <button
            type="button"
            key={key}
            className={`navigation-item ${current === key ? 'active' : ''}`}
            aria-current={current === key ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            <span className="navigation-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function HomeOverview({
  records,
  ready,
  onNavigate,
  onRecord,
}: {
  records: Inspection[];
  ready: boolean;
  onNavigate: (page: AppPage) => void;
  onRecord: (record?: Inspection) => void;
}) {
  const recent = records.slice(-3).reverse();
  return (
    <div className="overview-page">
      <section className="home-welcome">
        <div className="home-welcome-copy">
          <div className="eyebrow">DEVICE INSPECTION</div>
          <h1>每一次检测，清晰记录</h1>
          <p>
            拍摄设备、识别灯态、校对结果。
            <br />
            让检测数据保存在手边，随时查看与导出。
          </p>
          <button
            className="button primary"
            onClick={() => onNavigate('entry')}
          >
            开始录入 <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="home-welcome-mark" aria-hidden="true">
          <ScanLine size={62} strokeWidth={1.4} />
          <span>本机分析 · 本地保存</span>
        </div>
      </section>
      <dl className="home-statistics" aria-label="本地记录概览">
        <div>
          <dt>本地记录</dt>
          <dd>
            {ready ? records.length : '—'}
            <small>条</small>
          </dd>
        </div>
        <div>
          <dt>待校对</dt>
          <dd>
            {ready ? records.filter(needsReview).length : '—'}
            <small>条</small>
          </dd>
        </div>
        <div>
          <dt>分析失败</dt>
          <dd>
            {ready
              ? records.filter((record) => record.phase === 'error').length
              : '—'}
            <small>条</small>
          </dd>
        </div>
      </dl>
      <div className="home-shortcuts">
        <button className="shortcut-card" onClick={() => onNavigate('capture')}>
          <span className="shortcut-icon">
            <Camera size={24} aria-hidden="true" />
          </span>
          <span>
            <strong>现场拍照</strong>
            <small>对准定位框，拍清设备与条码</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <button className="shortcut-card" onClick={() => onRecord()}>
          <span className="shortcut-icon pale">
            <FileClock size={24} aria-hidden="true" />
          </span>
          <span>
            <strong>本地记录</strong>
            <small>查看、校对与导出检测数据</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <section
        className="recent-records"
        aria-labelledby="recent-records-title"
      >
        <div className="section-heading">
          <h2 id="recent-records-title">最近记录</h2>
          <button className="text-button" onClick={() => onRecord()}>
            查看全部 <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
        {recent.length ? (
          <div className="recent-record-list">
            {recent.map((record) => (
              <button
                className="recent-record"
                key={record.id}
                onClick={() => onRecord(record)}
                aria-label={`查看记录 ${record.name}`}
              >
                <img src={record.thumbnail} alt="" />
                <span className="recent-record-copy">
                  <strong>{record.barcode || record.name}</strong>
                  <small>{record.createdAt}</small>
                </span>
                <span
                  className={`record-state ${needsReview(record) ? 'pending' : 'reviewed'}`}
                >
                  {record.phase === 'reading'
                    ? '分析中'
                    : record.phase === 'queued'
                      ? '等待分析'
                      : record.phase === 'error'
                        ? '分析失败'
                        : conclude(record.device).title}
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty">
            <Images size={30} aria-hidden="true" />
            <strong>{ready ? '还没有检测记录' : '正在读取本地记录'}</strong>
            <p>从「录入」选择照片，或前往「拍照」记录第一台设备。</p>
          </div>
        )}
      </section>
      <p className="home-local-note">
        <ShieldCheck size={16} aria-hidden="true" />
        照片与结果在本机处理，导出由你主动选择。
      </p>
    </div>
  );
}

export function CapturePage({
  disabled,
  onCapture,
  onChoosePhotos,
  capacityReached,
}: {
  disabled: boolean;
  onCapture: () => void;
  onChoosePhotos: () => void;
  capacityReached: boolean;
}) {
  return (
    <div className="capture-page">
      <div className="page-heading">
        <div className="eyebrow">CAPTURE</div>
        <h1>拍照</h1>
        <p>让完整设备与试管条码清晰入镜。</p>
      </div>
      <section className="capture-instructions">
        <div className="capture-illustration" aria-hidden="true">
          <svg viewBox="0 0 280 340" fill="none">
            <path
              d="M48 68V36h32M200 36h32v32M232 272v32h-32M80 304H48v-32"
              stroke="#6a8ee5"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <rect
              x="117"
              y="46"
              width="46"
              height="142"
              rx="12"
              fill="#fff"
              stroke="#a9bad4"
              strokeWidth="2"
            />
            <rect x="115" y="42" width="50" height="21" rx="6" fill="#537fde" />
            <rect x="122" y="84" width="36" height="64" rx="3" fill="#f2f5fa" />
            <path
              d="M127 92v48M132 92v48M137 92v48M142 92v48M146 92v48M152 92v48"
              stroke="#7285a2"
              strokeWidth="2"
            />
            <rect
              x="93"
              y="170"
              width="94"
              height="124"
              rx="18"
              fill="#fff"
              stroke="#a9bad4"
              strokeWidth="2"
            />
            <path
              d="M109 191h19M109 213h19M109 235h19M109 257h19"
              stroke="#a4b5cc"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="167" cy="191" r="5" fill="#5ea985" />
            <circle cx="167" cy="213" r="5" fill="#dbe3ef" />
            <circle cx="167" cy="235" r="5" fill="#dbe3ef" />
            <circle cx="167" cy="257" r="5" fill="#dbe3ef" />
          </svg>
          <span>完整机身 + 试管条码</span>
        </div>
        <div className="capture-instructions-copy">
          <h2>对齐，再按下快门</h2>
          <ol className="capture-steps">
            <li>
              <span>1</span>
              <div>
                <strong>完整放入框内</strong>
                <p>竖直摆放设备，包含机身、四个灯位和试管。</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>看清条码与指示灯</strong>
                <p>保持对焦，避开反光，避免手指遮挡。</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>拍摄后检查结果</strong>
                <p>在录入页核对定位框与灯态，再校对保存。</p>
              </div>
            </li>
          </ol>
          <div className="capture-page-actions">
            <button
              className="button primary"
              disabled={disabled}
              onClick={onCapture}
            >
              <Camera size={19} aria-hidden="true" />
              开启相机
            </button>
            <button
              className="button secondary"
              disabled={disabled}
              onClick={onChoosePhotos}
            >
              <Images size={18} aria-hidden="true" />
              选择已有照片
            </button>
          </div>
          {capacityReached && (
            <p className="capacity-note">
              已达到 30 条记录上限，请先到录入页导出并移除不再需要的记录。
            </p>
          )}
          <p className="capture-page-note">
            定位框仅用于辅助对齐，拍摄保留完整画面。
          </p>
        </div>
      </section>
    </div>
  );
}

export function MyPage() {
  const [information, setInformation] = useState<'privacy' | 'about' | null>(
    null,
  );
  return (
    <div className="mine-page">
      <div className="page-heading">
        <div className="eyebrow">SETTINGS & INFORMATION</div>
        <h1>我的</h1>
        <p>应用信息与本地数据说明。</p>
      </div>
      <section className="app-identity" aria-label="检图应用信息">
        <span className="app-identity-logo">
          <ScanLine size={38} aria-hidden="true" />
        </span>
        <h2>检图</h2>
        <p>设备灯态检测</p>
        <span className="app-version">版本 1.0.9</span>
      </section>
      <section className="settings-list" aria-label="应用设置与说明">
        <div className="settings-row">
          <Languages size={21} aria-hidden="true" />
          <strong>语言</strong>
          <span>简体中文</span>
        </div>
        <div className="settings-row">
          <Smartphone size={21} aria-hidden="true" />
          <strong>当前版本</strong>
          <span>1.0.9</span>
        </div>
        <button
          className="settings-row"
          onClick={() => setInformation('privacy')}
        >
          <ShieldCheck size={21} aria-hidden="true" />
          <strong>隐私说明</strong>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button
          className="settings-row"
          onClick={() => setInformation('about')}
        >
          <Info size={21} aria-hidden="true" />
          <strong>关于检图</strong>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>
      <p className="mine-storage-note">
        <CircleHelp size={17} aria-hidden="true" />
        卸载应用或清除浏览器数据前，请先导出需要保留的检测数据。
      </p>
      <Dialog
        open={information !== null}
        onOpenChange={(open) => {
          if (!open) setInformation(null);
        }}
      >
        <DialogContent className="information-dialog">
          <DialogTitle>
            {information === 'privacy' ? '隐私说明' : '关于检图'}
          </DialogTitle>
          <DialogDescription>
            {information === 'privacy'
              ? '照片、结果与导出文件的处理方式。'
              : '版本 1.0.9 · 设备灯态检测'}
          </DialogDescription>
          <div className="information-copy">
            {information === 'privacy' ? (
              <>
                <h3>本机处理与保存</h3>
                <p>
                  设备照片、条码和灯态结果在本机处理，应用不会主动上传照片与检测结果。网页版记录保存在当前浏览器，Android
                  版记录保存在应用本地。
                </p>
                <h3>由你选择导出</h3>
                <p>
                  仅在你主动导出或分享时，检测数据才会写入指定的文件位置，或交给你选定的应用。请根据需要选择保存位置与接收方。
                </p>
                <h3>记录的保留与移除</h3>
                <p>
                  可在录入页移除本地记录。卸载应用、清除应用数据或浏览器站点数据会丢失本地记录。导出文件可保留检测数据，但不能还原完整原图档案。
                </p>
              </>
            ) : (
              <>
                <h3>从设备照片到检测记录</h3>
                <p>
                  检图用于识别试管条形码、定位机身与四路指示灯，并支持人工校对、本地记录和标准格式导出。
                </p>
                <h3>适配与结果规则</h3>
                <p>
                  当前适配样例蓝盖四灯设备。Negative、Positive、Invalid
                  三个结果灯互斥；Power
                  仅展示电源状态。图像不清或串光不能可靠排除时，需要人工确认。
                </p>
                <h3>数据交换</h3>
                <p>
                  支持 Excel、CSV、XML 和 HL7 FHIR R4
                  格式导出。接入具体医疗信息系统时，仍需按接收系统要求验证字段与编码映射。
                </p>
              </>
            )}
          </div>
          <button
            className="button secondary"
            onClick={() => setInformation(null)}
          >
            关闭
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
