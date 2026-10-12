'use client';
/* oxlint-disable next/no-img-element -- Local blob thumbnails are shared with offline Android and do not use an image server. */
import { useEffect, useRef, useState } from 'react';
import {
  ScanLine,
  Upload,
  FileSpreadsheet,
  Images,
  ShieldCheck,
  LoaderCircle,
  ScanBarcode,
  RotateCcw,
  Trash2,
  Pencil,
  CheckCheck,
  Copy,
  MousePointer2,
  TriangleAlert,
  Clock3,
  CircleHelp,
  Camera,
} from 'lucide-react';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AnalysisImage,
  type Layer,
} from '@/components/inspection/analysis-image';
import {
  conclude,
  needsReview,
  emptyDevice,
  setManualLampState,
  stateLabels,
  colorLabels,
  type Inspection,
} from '@/lib/inspection';
import { type Box, type LampState, type LampColor } from '@/lib/device-vision';
import { prepareImage, recognize, analyzeManualBody } from '@/lib/recognition';
import { isAndroid, pickAndroidPhotos } from '@/lib/native';
import { CameraDialog } from '@/components/inspection/camera-dialog';
import { ExportDialog } from '@/components/inspection/export-dialog';
import {
  BottomNavigation,
  HomeOverview,
  CapturePage,
  MyPage,
  type AppPage,
} from '@/components/inspection/app-navigation';
import { loadRecords, saveRecord, deleteRecord } from '@/lib/record-store';
import { exportInspectionFile, type ExportFormat } from '@/lib/file-export';

export default function Home() {
  const [page, setPage] = useState<AppPage>('home');
  const [records, setRecords] = useState<Inspection[]>([]),
    [activeId, setActiveId] = useState(''),
    [ready, setReady] = useState(false),
    [picking, setPicking] = useState(false),
    [cameraOpen, setCameraOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [storageError, setStorageError] = useState(''),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState(''),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState(''),
    [drag, setDrag] = useState(false),
    [layer, setLayer] = useState<Layer>('all'),
    [selecting, setSelecting] = useState(false),
    [edit, setEdit] = useState<Inspection | null>(null);
  const input = useRef<HTMLInputElement>(null),
    busyRef = useRef(false),
    recordRef = useRef(records),
    urls = useRef(new Set<string>());

  const active = records.find((r) => r.id === activeId) || records[0];
  const result = active ? conclude(active.device) : null;
  const captureDisabled =
    !ready || busy || picking || exporting || records.length >= 30;
  function navigate(next: AppPage) {
    setPage(next);
    setSelecting(false);
    setDrag(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function openRecord(record?: Inspection) {
    if (record) setActiveId(record.id);
    navigate('entry');
    requestAnimationFrame(() => {
      document
        .getElementById('local-records')
        ?.scrollIntoView({ block: 'start' });
    });
  }
  function updateRecords(next: Inspection[]) {
    recordRef.current = next;
    setRecords(next);
  }
  async function patch(id: string, update: Partial<Inspection>) {
    const current = recordRef.current.find((r) => r.id === id);
    if (!current) return;
    const next = { ...current, ...update };
    await saveRecord(next);
    updateRecords(recordRef.current.map((r) => (r.id === id ? next : r)));
  }
  useEffect(() => {
    let cancelled = false;
    loadRecords()
      .then(({ records: saved, warnings }) => {
        if (cancelled) {
          saved.forEach((r) => URL.revokeObjectURL(r.image));
          return;
        }
        saved.forEach((r) => urls.current.add(r.image));
        updateRecords(saved);
        setNotice(warnings.join('\n'));
        setReady(true);
      })
      .catch(() =>
        setStorageError(
          '无法读取本地记录，请重新打开应用。原始文件仍保留，暂时不能添加新照片。',
        ),
      );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const c = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'read_inspection_results',
            description: '读取当前照片的条形码、四路设备灯态和校对状态。',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (value: unknown) => {
              if (
                !value ||
                typeof value !== 'object' ||
                Array.isArray(value) ||
                Object.keys(value).length
              )
                throw new Error('参数必须为空对象');
              return recordRef.current.map((r) => ({
                id: r.id,
                name: r.name,
                barcode: r.barcode,
                lamps: r.device.lamps.map((l) => ({
                  key: l.key,
                  state: l.state,
                  color: l.color,
                })),
                conclusion: conclude(r.device),
                reviewed: r.reviewed,
              }));
            },
          },
          { signal: c.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => c.abort();
  }, []);
  async function process(items: Inspection[]) {
    for (const [index, r] of items.entries()) {
      await patch(r.id, { phase: 'reading' });
      try {
        const output = await recognize(r.image, (v, t) => {
          setProgress(v);
          setMessage(`第 ${index + 1} / ${items.length} 张 · ${t}`);
        });
        await patch(r.id, { ...output, phase: 'done', reviewed: false });
      } catch (e) {
        await patch(r.id, {
          phase: 'error',
          error:
            e instanceof Error ? e.message : '分析失败，请重试或人工校对。',
        });
      }
    }
  }
  async function upload(files: FileList | File[]) {
    if (!ready || busyRef.current || exporting) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    const batch: Inspection[] = [],
      errors: string[] = [];
    try {
      const incoming = Array.from(files),
        room = 30 - recordRef.current.length;
      if (incoming.length > room)
        errors.push(`当前最多保留 30 张，仅接收前 ${Math.max(0, room)} 张。`);
      for (const file of incoming.slice(0, Math.max(0, room))) {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 20 * 1024 * 1024
        ) {
          errors.push(`${file.name}：请使用 20 MB 以内的 JPG、PNG 或 WebP。`);
          continue;
        }
        try {
          const media = await prepareImage(file);
          urls.current.add(media.image);
          const record: Inspection = {
            id: crypto.randomUUID(),
            name: file.name,
            ...media,
            barcode: '',
            format: '',
            barcodeBox: null,
            barcodeSource: 'unread',
            device: emptyDevice(),
            rotation: 0,
            elapsedMs: 0,
            phase: 'queued',
            error: '',
            reviewed: false,
            createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
            createdTimestamp: Date.now(),
          };
          try {
            await saveRecord(record);
          } catch {
            URL.revokeObjectURL(record.image);
            throw new Error('本地保存失败，请检查手机剩余空间');
          }
          batch.push(record);
        } catch (e) {
          errors.push(
            `${file.name}：${e instanceof Error ? e.message : '无法读取'}`,
          );
        }
      }
      updateRecords([...recordRef.current, ...batch]);
      if (batch.length) {
        navigate('entry');
        setActiveId(batch[0].id);
        setSelecting(false);
      }
      setNotice(errors.join('\n'));
      await process(batch);
    } catch {
      setNotice('处理或本地保存失败，请检查剩余空间后重试。');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setMessage('');
    }
  }
  async function retry(r: Inspection) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSelecting(false);
    try {
      await process([r]);
    } catch {
      setNotice('处理或本地保存失败，请检查剩余空间后重试。');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setMessage('');
    }
  }
  async function selectBody(box: Box) {
    if (!active || busyRef.current) return;
    setSelecting(false);
    busyRef.current = true;
    setBusy(true);
    setMessage('按框选机身重新分析四路灯态');
    const id = active.id;
    try {
      const device = await analyzeManualBody(
        active.displayImage,
        box,
        active.imageWidth,
        active.imageHeight,
      );
      await patch(id, { device, reviewed: false });
    } catch {
      setNotice('框选分析失败，请重试。');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function download(format: ExportFormat, action: 'save' | 'share') {
    if (busyRef.current || exporting || !records.length) return;
    setExporting(true);
    setNotice('');
    try {
      setNotice(await exportInspectionFile(records, format, action));
      setExportOpen(false);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `数据导出失败：${error.message}`
          : '数据导出失败，请检查存储空间与保存位置后重试。',
      );
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  }
  async function remove(r: Inspection) {
    try {
      await deleteRecord(r.id);
    } catch {
      setNotice('本地记录删除失败，请重试。');
      return;
    }
    updateRecords(recordRef.current.filter((x) => x.id !== r.id));
    urls.current.delete(r.image);
    URL.revokeObjectURL(r.image);
    setSelecting(false);
  }
  async function saveEdit() {
    if (!edit) return;
    try {
      await patch(edit.id, {
        barcode: edit.barcode.trim(),
        barcodeSource: edit.barcodeSource,
        device: edit.device,
        reviewed: true,
      });
      setEdit(null);
    } catch {
      setNotice('校对结果未能保存，请检查剩余空间后重试。');
    }
  }
  async function choosePhotos() {
    if (
      !ready ||
      busyRef.current ||
      picking ||
      exporting ||
      recordRef.current.length >= 30
    )
      return;
    if (!isAndroid()) {
      input.current?.click();
      return;
    }
    busyRef.current = true;
    setPicking(true);
    try {
      const files = await pickAndroidPhotos();
      busyRef.current = false;
      if (files.length) await upload(files);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '选图失败，请重试。');
    } finally {
      busyRef.current = false;
      setPicking(false);
    }
  }
  async function takePhoto() {
    if (
      !ready ||
      busyRef.current ||
      picking ||
      exporting ||
      records.length >= 30
    )
      return;
    setNotice('');
    navigate('capture');
    setCameraOpen(true);
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <ScanLine size={23} />
          </span>
          检图 <span className="brand-divider" />
          设备灯态检测
        </div>
        <span className="local-badge">
          <ShieldCheck size={16} />
          照片在本机分析
        </span>
      </header>
      <main
        aria-label={
          { home: '首页', entry: '录入', capture: '拍照', mine: '我的' }[page]
        }
      >
        <input
          className="sr-only"
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="选择设备照片"
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = '';
          }}
        />
        <output
          className="storage-status"
          hidden={page !== 'entry' && ready && !storageError}
        >
          {storageError ||
            (!ready
              ? '正在恢复本地记录…'
              : busy
                ? '照片与结果将逐张保存到本机'
                : `已保存到本机 · ${records.length} 条记录`)}
        </output>
        {busy && (
          <output className="processing">
            <span>
              <LoaderCircle size={16} className="spin" />
              {message || '正在读取图片'}
            </span>
            <Progress value={progress} aria-label="照片处理进度" />
          </output>
        )}
        {notice && (
          <div className="notice" role="alert">
            {notice}
          </div>
        )}
        {page === 'home' && (
          <HomeOverview
            records={records}
            ready={ready}
            onNavigate={navigate}
            onRecord={openRecord}
          />
        )}
        {page === 'capture' && (
          <CapturePage
            disabled={captureDisabled}
            capacityReached={records.length >= 30}
            onCapture={() => void takePhoto()}
            onChoosePhotos={() => void choosePhotos()}
          />
        )}
        {page === 'mine' && <MyPage />}
        {page === 'entry' && (
          <div className="entry-page">
            <div className="heading">
              <div>
                <div className="eyebrow">DEVICE INSPECTION</div>
                <h1>录入与校对</h1>
                <p>
                  识别试管条码、机身与四路指示灯，支持逐张校对与标准数据导出。
                </p>
              </div>
              <div className="export-actions">
                <button
                  className="button primary"
                  disabled={
                    !ready || !records.length || busy || picking || exporting
                  }
                  onClick={() => setExportOpen(true)}
                >
                  {exporting ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <FileSpreadsheet size={18} />
                  )}
                  导出数据 {records.length ? `(${records.length})` : ''}
                </button>
              </div>
            </div>
            <section
              className={`upload-zone ${drag ? 'dragging' : ''} ${records.length ? 'compact' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void upload(e.dataTransfer.files);
              }}
            >
              <span className="upload-icon">
                <Upload size={24} />
              </span>
              <div>
                <h2>{busy ? '正在分析照片' : '添加设备照片'}</h2>
                <p>拍清完整机身、四个指示灯和试管条码 · JPG / PNG / WebP</p>
              </div>
              <button
                className="button secondary"
                disabled={
                  !ready || busy || picking || exporting || records.length >= 30
                }
                onClick={() => void choosePhotos()}
              >
                选择照片
              </button>
              <button
                className="button primary"
                disabled={
                  !ready || busy || picking || exporting || records.length >= 30
                }
                onClick={() => void takePhoto()}
              >
                <Camera size={18} />
                拍照
              </button>
              <span className="upload-limit">最多 30 张 · 单张 20 MB</span>
            </section>
            {!active ? (
              <section className="results-empty">
                <Empty>
                  <Images size={38} />
                  <EmptyTitle className="text-lg">
                    等待第一张设备照片
                  </EmptyTitle>
                  <EmptyDescription>
                    上传后先查看照片上的定位框，再核对
                    Negative、Positive、Invalid 与 Power 四路灯态。
                  </EmptyDescription>
                </Empty>
                <p>当前适配样例中的蓝盖四灯设备，其他型号需单独校准。</p>
              </section>
            ) : (
              <>
                <div className="batch-heading" id="local-records">
                  <h2>
                    本地照片 <span>{records.length}</span>
                  </h2>
                  <span>
                    {records.filter((r) => !needsReview(r)).length} 张已校对
                  </span>
                </div>
                <div className="photo-strip" aria-label="切换照片">
                  {records.map((r, index) => (
                    <button
                      key={r.id}
                      className={`photo-item ${r.id === active.id ? 'active' : ''}`}
                      aria-label={`查看照片 ${r.name}`}
                      onClick={() => {
                        setActiveId(r.id);
                        setSelecting(false);
                      }}
                    >
                      <img src={r.thumbnail} alt="" />
                      <span>
                        <strong>
                          {String(index + 1).padStart(2, '0')} · {r.name}
                        </strong>
                        <small>
                          {r.phase === 'reading'
                            ? '分析中…'
                            : r.phase === 'queued'
                              ? '等待分析'
                              : conclude(r.device).title}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="inspection-workspace">
                  <section className="visual-panel">
                    <div className="panel-title">
                      <h2>识别过程</h2>
                      <span>
                        {(active.device.body ? 1 : 0) +
                          (active.barcodeBox ? 1 : 0) +
                          active.device.lamps.filter((l) => l.box.width > 0)
                            .length}{' '}
                        个定位区域
                      </span>
                    </div>
                    <Tabs
                      value={layer}
                      onValueChange={(value) => setLayer(value as Layer)}
                    >
                      <TabsList className="layer-tabs" aria-label="显示图层">
                        {[
                          ['all', '全部目标'],
                          ['lamps', '四路灯位'],
                          ['body', '机身'],
                          ['barcode', '条码'],
                          ['none', '原图'],
                        ].map(([value, label]) => (
                          <TabsTrigger value={value} key={value}>
                            {label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <div className="image-stage">
                      <AnalysisImage
                        record={active}
                        layer={layer}
                        selecting={selecting}
                        onSelect={(box) => void selectBody(box)}
                      />
                    </div>
                    <div className="image-controls">
                      <button
                        className={`button small ${selecting ? 'primary' : 'secondary'}`}
                        disabled={busy || !active.imageWidth}
                        onClick={() => {
                          setSelecting((v) => !v);
                          setLayer('all');
                        }}
                      >
                        <MousePointer2 size={15} />
                        {selecting ? '取消框选' : '框选机身重新分析'}
                      </button>
                      <a href={active.image} target="_blank" rel="noreferrer">
                        查看上传原图 ↗
                      </a>
                    </div>
                    <p className="panel-note">
                      {selecting
                        ? '从机身左上角拖到右下角，包含全部四个灯位，不含试管和电缆。'
                        : '青色：机身 · 紫色：条码 · 红 / 黄：亮起灯位 · 灰色：未见亮起'}
                    </p>
                  </section>
                  <section className="report-panel">
                    <div className={`conclusion ${result!.tone}`}>
                      <div className="conclusion-icon">
                        {result!.code === 'unknown' ? (
                          <CircleHelp />
                        ) : (
                          <TriangleAlert />
                        )}
                      </div>
                      <div>
                        <span>综合指示汇总</span>
                        <h2>{result!.title}</h2>
                      </div>
                      <span className="review-badge">
                        {active.reviewed ? '已人工校对' : '待人工校对'}
                      </span>
                    </div>
                    <div className="local-processing">
                      <ShieldCheck size={23} />
                      <div>
                        <strong>本地光学分析</strong>
                        <p>机身定位 + 四路灯位测量 + 条码解码</p>
                      </div>
                      <span>
                        <Clock3 size={15} />
                        {active.elapsedMs ? `${active.elapsedMs} ms` : '—'}
                      </span>
                    </div>
                    <div className="barcode-row">
                      <ScanBarcode size={25} />
                      <div>
                        <span>试管条形码编号</span>
                        <strong>
                          {active.barcode || '未识别，请校对录入'}
                        </strong>
                        <small>
                          {active.barcodeSource === 'decoded'
                            ? `${active.format} · 从条码图案解码`
                            : active.barcodeSource === 'manual'
                              ? '人工录入'
                              : '待确认'}
                        </small>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="复制条形码"
                        disabled={!active.barcode}
                        onClick={() =>
                          navigator.clipboard
                            .writeText(active.barcode)
                            .then(() => setNotice('条形码已复制。'))
                            .catch(() =>
                              setNotice(
                                '无法自动复制，请在校对窗口选中条形码复制。',
                              ),
                            )
                        }
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                    <div className="lamp-heading">
                      <h2>四路指示灯</h2>
                      <span>亮起 / 未见亮起</span>
                    </div>
                    <div className="lamp-grid">
                      {active.device.lamps.map((l) => (
                        <div
                          key={l.key}
                          className={`lamp-card ${l.state === 'on' ? 'lit ' + l.color : ''}`}
                        >
                          <div>
                            <h3>
                              {l.key === 'power' ? 'Power（电源）' : l.label}
                            </h3>
                            <span
                              className={`lamp-dot ${l.state === 'on' ? l.color : ''}`}
                            />
                          </div>
                          <strong>
                            {l.state === 'on'
                              ? '●'
                              : l.state === 'off'
                                ? '○'
                                : '?'}{' '}
                            {l.key === 'power' && l.state === 'unknown'
                              ? '未识别'
                              : stateLabels[l.state]}
                            {l.state === 'on'
                              ? `（${colorLabels[l.color]}）`
                              : ''}
                          </strong>
                          <p>
                            {l.key === 'power'
                              ? '仅展示电源灯状态，不影响检测结果'
                              : l.manual
                                ? '人工校对'
                                : l.reason}
                          </p>
                          <div className="measurements">
                            <span>峰值 {l.peak} / 255</span>
                            <span>高亮像素 {l.brightPixels}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="analysis-summary">
                      <h3>分析摘要</h3>
                      <p>{result!.summary}</p>
                      {[active.error, ...result!.warnings]
                        .filter(Boolean)
                        .map((warning, index) => (
                          <div className="warning-line" key={index}>
                            <TriangleAlert size={16} />
                            <span>{warning}</span>
                          </div>
                        ))}
                      <p className="method-note">
                        按样例设备布局定位并测量发光像素。框位偏移时请重新框选机身；这里不显示未经模型验证的置信度。
                      </p>
                    </div>
                    <div className="report-actions">
                      <button
                        className="button secondary"
                        disabled={busy || exporting}
                        onClick={() => void retry(active)}
                      >
                        <RotateCcw size={16} />
                        重新识别
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || exporting}
                        onClick={() => setEdit(structuredClone(active))}
                      >
                        <Pencil size={16} />
                        校对并保存
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`移除 ${active.name}`}
                        disabled={busy || exporting}
                        onClick={() => remove(active)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </section>
                </div>
              </>
            )}
            <footer>
              <span>适配：样例蓝盖四灯设备</span>
              <span>
                照片和结果自动保存在本机；卸载应用或清除数据前，请导出检测数据。导出文件不能还原完整原图档案。
              </span>
            </footer>
          </div>
        )}
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          records={records}
          exporting={exporting}
          onExport={(format, action) => void download(format, action)}
        />
        <CameraDialog
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            void upload([file]);
          }}
        />
        <Dialog
          open={!!edit}
          onOpenChange={(open) => {
            if (!open) setEdit(null);
          }}
        >
          <DialogContent className="edit-dialog">
            <DialogTitle>校对设备灯态与条形码</DialogTitle>
            <DialogDescription>
              Negative、Positive、Invalid
              只选一个亮起，选择后其余两个自动设为未亮；Power
              是电源灯，仅展示，亮灭均不影响结果。请对照原图校对。
            </DialogDescription>
            {edit && (
              <>
                <label className="form-label">
                  试管条形码
                  <input
                    className="text-input mono"
                    value={edit.barcode}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        barcode: e.target.value,
                        barcodeSource: 'manual',
                      })
                    }
                  />
                </label>
                <div className="edit-lamps">
                  {edit.device.lamps.map((l) => (
                    <div className="edit-lamp" key={l.key}>
                      <span>
                        {l.key === 'power' ? 'Power（仅展示）' : l.label}
                      </span>
                      <Select
                        value={l.state}
                        onValueChange={(value) => {
                          if (value)
                            setEdit({
                              ...edit,
                              device: setManualLampState(
                                edit.device,
                                l.key,
                                value as LampState,
                              ),
                            });
                        }}
                      >
                        <SelectTrigger aria-label={`${l.label} 灯态`}>
                          <SelectValue>
                            {l.key === 'power' && l.state === 'unknown'
                              ? '未识别'
                              : stateLabels[l.state]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(stateLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {l.key === 'power' && value === 'unknown'
                                ? '未识别'
                                : label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        disabled={l.state !== 'on'}
                        value={l.color}
                        onValueChange={(value) => {
                          if (value)
                            setEdit({
                              ...edit,
                              device: {
                                ...edit.device,
                                lamps: edit.device.lamps.map((x) =>
                                  x.key === l.key
                                    ? {
                                        ...x,
                                        color: value as LampColor,
                                        manual: true,
                                      }
                                    : x,
                                ),
                              },
                            });
                        }}
                      >
                        <SelectTrigger aria-label={`${l.label} 颜色`}>
                          <SelectValue>{colorLabels[l.color]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(colorLabels)
                            .filter(([v]) => v !== 'none' || l.state !== 'on')
                            .map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <p className="edit-conclusion">
                  校对后：{conclude(edit.device).title}
                </p>
                <div className="dialog-actions">
                  <button
                    className="button secondary"
                    onClick={() => setEdit(null)}
                  >
                    取消
                  </button>
                  <button className="button primary" onClick={saveEdit}>
                    <CheckCheck size={16} />
                    保存校对
                  </button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
      <BottomNavigation current={page} onNavigate={navigate} />
    </div>
  );
}
