'use client';
/* oxlint-disable next/no-img-element -- Offline local images shared with Android. */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  History,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  Brand,
  BottomNavigation,
  HomeOverview,
  MyPage,
  type AppPage,
  type Language,
} from '@/components/inspection/app-navigation';
import { CameraDialog } from '@/components/inspection/camera-dialog';
import { ExportDialog } from '@/components/inspection/export-dialog';
import { AnalysisImage } from '@/components/inspection/analysis-image';
import { PatientSelect } from '@/components/inspection/patient-select';
import {
  conclude,
  confirmInspection,
  emptyDevice,
  needsReview,
  type Inspection,
} from '@/lib/inspection';
import {
  emptyPatientInfo,
  normalizePatientInfo,
  validatePatientInfo,
  TEST_ITEMS,
  type PatientDraft,
} from '@/lib/patient';
import { prepareImage, recognize } from '@/lib/recognition';
import { loadRecords, saveRecord } from '@/lib/record-store';
import { exportInspectionFile, type ExportFormat } from '@/lib/file-export';
import { isAndroid, pickAndroidPhotos } from '@/lib/native';
import { PHOTO_ACCEPT, validatePhotoFile } from '@/lib/photo-input';

const resultText = (record: Inspection, zh: boolean, raw = false) => {
  if (record.phase === 'error') return zh ? '识别失败' : 'Analysis failed';
  if (record.phase !== 'done') return zh ? '正在识别' : 'Processing';
  if (!raw && needsReview(record)) return zh ? '待确认' : 'Unresolved';
  const code = conclude(record.device).code;
  return {
    positive: zh ? '阳性指示' : 'Positive',
    negative: zh ? '阴性指示' : 'Negative',
    invalid: zh ? '无效指示' : 'Invalid',
    conflict: zh ? '待确认' : 'Unresolved',
    unknown: zh ? '待确认' : 'Unresolved',
  }[code];
};
const recordTone = (record: Inspection, raw = false) =>
  record.phase === 'done' && (raw || !needsReview(record))
    ? conclude(record.device).tone
    : 'amber';
function displayTime(record: Inspection, language: Language) {
  return record.createdTimestamp
    ? new Date(record.createdTimestamp).toLocaleString(
        language === 'zh' ? 'zh-CN' : 'en-GB',
        { hour12: false },
      )
    : record.createdAt;
}
export default function Home() {
  const [page, setPage] = useState<AppPage>('home');
  const [language, setLanguage] = useState<Language>('en');
  const [defaultFormat, setDefaultFormat] = useState<ExportFormat>('xlsx');
  const [records, setRecords] = useState<Inspection[]>([]);
  const [ready, setReady] = useState(false);
  const [patient, setPatient] = useState<PatientDraft>(emptyPatientInfo);
  const [attempted, setAttempted] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [liveId, setLiveId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [exportRecords, setExportRecords] = useState<Inspection[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recordRef = useRef<Inspection[]>([]);
  const busyRef = useRef(false);
  const pickingRef = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const zh = language === 'zh';
  const t = (en: string, cn: string) => (zh ? cn : en);
  const active = records.find((r) => r.id === activeId);
  const errors = validatePatientInfo(patient);
  const valid = Object.keys(errors).length === 0;
  function updateRecords(next: Inspection[]) {
    recordRef.current = next;
    setRecords(next);
  }
  function updateRecord(next: Inspection) {
    updateRecords(recordRef.current.map((r) => (r.id === next.id ? next : r)));
  }
  function navigate(next: AppPage) {
    setPage(next);
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function begin() {
    setPatient(emptyPatientInfo());
    setAttempted(false);
    setLiveId('');
    navigate('entry');
  }
  useEffect(() => {
    let cancelled = false;
    loadRecords()
      .then(({ records: saved, warnings }) => {
        if (cancelled) {
          saved.forEach((r) => URL.revokeObjectURL(r.image));
          return;
        }
        try {
          const lang = localStorage.getItem('gendx-language');
          if (lang === 'en' || lang === 'zh') setLanguage(lang);
          const fmt = localStorage.getItem('gendx-export-format');
          if (
            ['xlsx', 'csv', 'hl7-v2', 'fhir-json', 'fhir-xml'].includes(
              fmt || '',
            )
          )
            setDefaultFormat(fmt as ExportFormat);
        } catch {
          /* Storage preferences are optional. */
        }
        saved.forEach((r) => urls.current.add(r.image));
        updateRecords(saved);
        setNotice(warnings.join('\n'));
        setReady(true);
      })
      .catch(() => {
        setStorageError(true);
        setNotice(
          'Local records could not be loaded. Reopen the app. / 无法读取本机记录，请重新打开应用。',
        );
      });
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
    document.documentElement.lang = zh ? 'zh-CN' : 'en';
  }, [zh]);
  useEffect(() => {
    const input = photoInput.current;
    const cancelled = () => {
      pickingRef.current = false;
      setPicking(false);
    };
    input?.addEventListener('cancel', cancelled);
    return () => input?.removeEventListener('cancel', cancelled);
  }, []);
  function changeLanguage(value: Language) {
    setLanguage(value);
    try {
      localStorage.setItem('gendx-language', value);
    } catch {}
  }
  function openCamera() {
    setAttempted(true);
    if (
      !valid ||
      busyRef.current ||
      pickingRef.current ||
      !ready ||
      storageError
    )
      return;
    setCameraOpen(true);
  }
  function finishPicking() {
    pickingRef.current = false;
    setPicking(false);
  }
  async function uploadPhoto() {
    setAttempted(true);
    if (
      !valid ||
      busyRef.current ||
      pickingRef.current ||
      !ready ||
      storageError
    )
      return;
    setNotice('');
    pickingRef.current = true;
    setPicking(true);
    if (!isAndroid()) {
      photoInput.current?.click();
      return;
    }
    try {
      const files = await pickAndroidPhotos({ multiple: false });
      finishPicking();
      if (files.length === 1) await processPhoto(files[0]);
    } catch {
      setNotice(
        t(
          'Could not read the selected photo. Choose a JPG, PNG or WebP up to 20 MB and try again.',
          '无法读取所选照片，请选择 20 MB 以内的 JPG、PNG 或 WebP 后重试。',
        ),
      );
    } finally {
      finishPicking();
    }
  }
  async function processPhoto(file: File) {
    if (busyRef.current || !ready || !valid || storageError) return;
    const fileError = validatePhotoFile(file);
    if (fileError) {
      setNotice(
        t(
          fileError === 'empty'
            ? 'This photo is empty. Please choose another photo.'
            : 'Choose a JPG, PNG or WebP photo up to 20 MB.',
          fileError === 'empty'
            ? '这张照片为空，请重新选择。'
            : '请选择 20 MB 以内的 JPG、PNG 或 WebP 照片。',
        ),
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCameraOpen(false);
    setProgress(0);
    setNotice('');
    const capturedPatient = normalizePatientInfo(patient);
    let current: Inspection | undefined;
    try {
      let media: Awaited<ReturnType<typeof prepareImage>>;
      try {
        media = await prepareImage(file);
      } catch {
        setNotice(
          t(
            'This photo could not be opened. Choose a readable JPG, PNG or WebP with no more than 60 megapixels.',
            '无法打开这张照片，请选择可正常查看且不超过 6000 万像素的 JPG、PNG 或 WebP。',
          ),
        );
        return;
      }
      urls.current.add(media.image);
      const now = Date.now();
      current = {
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
        createdAt: new Date(now).toLocaleString('zh-CN', { hour12: false }),
        createdTimestamp: now,
        patient: capturedPatient,
      };
      await saveRecord(current);
      updateRecords([...recordRef.current, current]);
      setActiveId(current.id);
      setLiveId(current.id);
      setPatient(emptyPatientInfo());
      setPage('result');
      current = { ...current, phase: 'reading' };
      await saveRecord(current);
      updateRecord(current);
      let output: Awaited<ReturnType<typeof recognize>>;
      try {
        output = await recognize(current.image, (v) => setProgress(v));
      } catch (e) {
        current = {
          ...current,
          phase: 'error',
          error: e instanceof Error ? e.message : 'Analysis failed',
        };
        await saveRecord(current);
        updateRecord(current);
        return;
      }
      current = { ...current, ...output, phase: 'done', reviewed: false };
      await saveRecord(current);
      updateRecord(current);
      setProgress(100);
    } catch {
      setNotice(
        t(
          'The photo or result could not be saved. Check free storage and reopen the app before continuing.',
          '照片或结果保存失败，请检查剩余空间并重新打开应用后继续。',
        ),
      );
      setStorageError(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (
      !active ||
      active.id !== liveId ||
      active.lockedAt ||
      busyRef.current ||
      storageError
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      const next = confirmInspection(active);
      await saveRecord(next);
      updateRecord(next);
      setLiveId('');
      setNotice(
        t(
          'Result saved. This record is now read-only.',
          '结果已保存，此记录为只读。',
        ),
      );
    } catch {
      setNotice(
        t(
          'Could not confirm this record. Please try again.',
          '记录确认失败，请重试。',
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function openExport(scope: 'all' | 'selected') {
    const items =
      scope === 'all' ? records : records.filter((r) => selected.has(r.id));
    if (!items.length) return;
    setExportScope(scope);
    setExportRecords(items);
    setExportOpen(true);
  }
  async function doExport(format: ExportFormat, action: 'save' | 'share') {
    if (exporting) return;
    setExporting(true);
    try {
      const message = await exportInspectionFile(exportRecords, format, action);
      setNotice(
        zh
          ? message
          : message.includes('取消')
            ? 'Export cancelled.'
            : message.includes('发起')
              ? 'Download started. Check your browser downloads.'
              : message.includes('分享')
                ? 'File handed to the selected app.'
                : 'Export completed.',
      );
      setExportOpen(false);
    } catch (e) {
      setNotice(
        t('Export failed: ', '导出失败：') +
          (e instanceof Error ? e.message : ''),
      );
    } finally {
      setExporting(false);
    }
  }
  const filtered = records
    .filter((r) => {
      const search = [
        r.patient?.name,
        r.patient?.patientId,
        r.patient?.testItem,
        r.barcode,
      ]
        .join(' ')
        .toLowerCase();
      return (
        search.includes(query.trim().toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'unresolved'
            ? r.phase !== 'done' || needsReview(r)
            : r.phase === 'done' &&
              !needsReview(r) &&
              conclude(r.device).code === filter))
      );
    })
    .slice()
    .reverse();
  const blocked = !ready || busy || picking || exporting || storageError;
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand-button"
          disabled={busy || picking}
          onClick={() => navigate('home')}
          aria-label={t('Go to home', '返回首页')}
        >
          <Brand />
        </button>
        <span className="app-name">GenDX_T</span>
        <span className="local-badge">
          <span />
          {t('LOCAL ONLY', '仅保存在本机')}
        </span>
      </header>
      <main>
        <input
          ref={photoInput}
          type="file"
          hidden
          accept={PHOTO_ACCEPT}
          aria-label={t('Choose device photo', '选择设备照片')}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            finishPicking();
            if (file) void processPhoto(file);
          }}
        />
        {notice && <output className="notice">{notice}</output>}
        {!ready && !storageError && (
          <p className="loading-records">
            <LoaderCircle size={17} className="spin" />
            {t('Loading local records…', '正在读取本机记录…')}
          </p>
        )}
        {page === 'home' && (
          <HomeOverview
            language={language}
            disabled={blocked}
            count={records.length}
            onStart={begin}
            onHistory={() => navigate('history')}
          />
        )}
        {page === 'entry' && (
          <section className="entry-page">
            <button
              className="back-link"
              disabled={busy || picking}
              onClick={() => navigate('home')}
            >
              <ArrowLeft size={17} />
              {t('Home', '首页')}
            </button>
            <div className="page-heading">
              <span className="eyebrow">
                01 / {t('PATIENT INFORMATION', '患者信息')}
              </span>
              <h1>{t('A new test starts here.', '录入本次患者信息')}</h1>
              <p>
                {t(
                  'Complete all required fields, then take or upload a photo.',
                  '填写全部必填信息后，即可拍照或上传设备照片。',
                )}
              </p>
            </div>
            <form
              className="patient-form"
              onSubmit={(e) => {
                e.preventDefault();
                openCamera();
              }}
              noValidate
            >
              <div className="form-section-title">
                <UserMark />
                <div>
                  <h2>{t('Patient information', '患者信息')}</h2>
                  <p>
                    {t(
                      'A separate entry is required for each photo.',
                      '每张照片均需单独录入患者信息。',
                    )}
                  </p>
                </div>
                <span>{t('* Required', '* 必填')}</span>
              </div>
              <fieldset className="patient-fields" disabled={busy || picking}>
                {(
                  [
                    {
                      key: 'name',
                      label: t('Patient name', '患者名字'),
                      placeholder: t('Enter full name', '请输入患者姓名'),
                      max: 100,
                    },
                    {
                      key: 'patientId',
                      label: t('Patient ID', '患者编号'),
                      placeholder: t('Enter patient ID', '请输入患者编号'),
                      max: 80,
                    },
                    {
                      key: 'age',
                      label: t('Age', '患者年龄'),
                      placeholder: t('Age in years', '请输入年龄（岁）'),
                      max: 3,
                    },
                    {
                      key: 'contact',
                      label: t('Contact number', '联系方式'),
                      placeholder: t('Enter contact number', '请输入联系方式'),
                      max: 80,
                    },
                  ] as const
                ).map((field) => (
                  <label className={`field field-${field.key}`} key={field.key}>
                    <span>
                      {field.label}
                      <b> *</b>
                    </span>
                    <input
                      value={patient[field.key]}
                      maxLength={field.max}
                      inputMode={
                        field.key === 'age'
                          ? 'numeric'
                          : field.key === 'contact'
                            ? 'tel'
                            : 'text'
                      }
                      autoComplete="off"
                      onBlur={() => setAttempted(true)}
                      placeholder={field.placeholder}
                      aria-required="true"
                      aria-invalid={attempted && !!errors[field.key]}
                      onChange={(e) =>
                        setPatient({ ...patient, [field.key]: e.target.value })
                      }
                    />
                    {attempted && errors[field.key] && (
                      <small className="field-error">
                        {t(
                          field.key === 'age'
                            ? 'Enter a whole age from 0 to 150.'
                            : 'Please complete this field.',
                          '请填写有效信息；年龄需为 0–150 的整数。',
                        )}
                      </small>
                    )}
                  </label>
                ))}
                <PatientSelect
                  id="patient-gender"
                  className="field-gender"
                  label={t('Gender', '患者性别')}
                  placeholder={t('Select gender', '请选择性别')}
                  value={patient.gender}
                  invalid={attempted && !!errors.gender}
                  items={[
                    { value: 'male', label: t('Male', '男') },
                    { value: 'female', label: t('Female', '女') },
                    { value: 'other', label: t('Other', '其他') },
                  ]}
                  onValueChange={(gender) => setPatient({ ...patient, gender })}
                />
                <PatientSelect
                  id="patient-test-item"
                  className="field-test"
                  label={t('Test item', '检测项目')}
                  placeholder={t('Select a test item', '请选择检测项目')}
                  value={patient.testItem}
                  invalid={attempted && !!errors.testItem}
                  items={TEST_ITEMS.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  onValueChange={(testItem) =>
                    setPatient({ ...patient, testItem })
                  }
                />
              </fieldset>
              <div className="form-footer">
                <p>
                  <ShieldCheck size={16} />
                  {t(
                    'Patient information stays on this device.',
                    '患者信息仅保存在本机。',
                  )}
                </p>
                <div className="photo-actions">
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!valid || blocked}
                  >
                    <Camera size={19} />
                    {t('Take photo', '拍照')}
                    <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={!valid || blocked}
                    onClick={() => void uploadPhoto()}
                  >
                    {picking ? (
                      <LoaderCircle size={19} className="spin" />
                    ) : (
                      <ImagePlus size={19} />
                    )}
                    {t('Upload photo', '上传照片')}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </form>
            <p className="capture-note">
              {t(
                'Include the full device and specimen barcode. Upload one JPG, PNG or WebP, up to 20 MB.',
                '照片需包含完整机身和试管条码。每次上传一张 JPG、PNG 或 WebP，大小不超过 20 MB。',
              )}
            </p>
          </section>
        )}
        {(page === 'result' || page === 'detail') && active && (
          <section className="result-page">
            <button
              className="back-link"
              disabled={busy}
              onClick={() => navigate(page === 'detail' ? 'history' : 'home')}
            >
              <ArrowLeft size={17} />
              {page === 'detail' ? t('History', '历史') : t('Home', '首页')}
            </button>
            <div className="page-heading result-heading">
              <div>
                <span className="eyebrow">
                  {page === 'detail' ? 'RECORD DETAILS' : '03 / TEST RESULT'}
                </span>
                <h1>
                  {page === 'detail'
                    ? t('Detection result', '检测详情')
                    : t('Photo information', '照片结果')}
                </h1>
              </div>
              <span className="readonly">
                <LockKeyhole size={14} />
                {t('Read-only record', '只读记录')}
              </span>
            </div>
            {busy && (
              <output className="processing">
                <LoaderCircle className="spin" size={19} />
                <span>
                  {t(
                    'Analyzing and saving on this device…',
                    '正在本机识别并保存…',
                  )}
                </span>
                <progress max="100" value={progress} />
              </output>
            )}
            <div className="result-layout">
              <div className="result-photo-card">
                <div className="image-stage">
                  <AnalysisImage record={active} />
                </div>
                <p>
                  {t(
                    'Original capture with detected positions',
                    '拍摄照片及识别定位标注',
                  )}
                </p>
              </div>
              <div className="result-information">
                <div
                  className={`result-banner ${recordTone(active, page === 'result')}`}
                >
                  <span>{t('Test result', '检测结果')}</span>
                  <strong>{resultText(active, zh, page === 'result')}</strong>
                  <small>
                    {active.patient?.testItem ||
                      t('Legacy record', '历史旧记录')}{' '}
                    · {t('Device indication', '设备灯态指示')}
                  </small>
                </div>
                {!active.reviewed && active.phase === 'done' && (
                  <p className="confirmation-note">
                    {t(
                      'Not confirmed · the displayed indication must be checked against the photo.',
                      '尚未确认 · 请对照照片检查设备指示。',
                    )}
                  </p>
                )}
                <dl className="record-details">
                  <div className="specimen">
                    <dt>{t('Specimen ID', '样本编号')}</dt>
                    <dd>{active.barcode || t('Not decoded', '未识别')}</dd>
                  </div>
                  <PatientDetails record={active} language={language} />
                  <div>
                    <dt>{t('Test time', '检测时间')}</dt>
                    <dd>{displayTime(active, language)}</dd>
                  </div>
                </dl>
                <div className="lamp-summary">
                  {active.device.lamps.map((lamp) => (
                    <span key={lamp.key}>
                      <i
                        className={`lamp-dot ${lamp.state === 'on' ? lamp.color : ''}`}
                      />
                      <b>{lamp.label}</b>
                      <em>
                        {lamp.state === 'on'
                          ? t('On', '亮')
                          : lamp.state === 'off'
                            ? t('Off', '灭')
                            : t('Unknown', '未知')}
                      </em>
                      {lamp.key === 'power' && (
                        <small>{t('Display only', '仅展示')}</small>
                      )}
                    </span>
                  ))}
                </div>
                {(active.phase === 'error' ||
                  !active.barcode ||
                  ['unknown', 'conflict'].includes(
                    conclude(active.device).code,
                  )) && (
                  <p className="unresolved-note">
                    <TriangleAlert size={17} />
                    {t(
                      'This record needs review. Uncertain readings are preserved and are not exported as a confirmed positive or negative result.',
                      '本记录待确认。不确定结果按原状态保留，不会导出为已确认阴性或阳性。',
                    )}
                  </p>
                )}
                {active.phase === 'error' && (
                  <p className="technical-error">{active.error}</p>
                )}
              </div>
            </div>
            {page === 'result' && (
              <div className="result-actions">
                {liveId === active.id && !active.lockedAt ? (
                  <>
                    <button
                      className="button secondary"
                      disabled={blocked}
                      onClick={begin}
                    >
                      <Camera size={18} />
                      {t('New photo', '重新拍照或上传')}
                    </button>
                    <button
                      className="button primary"
                      disabled={
                        blocked || !['done', 'error'].includes(active.phase)
                      }
                      onClick={() => void confirm()}
                    >
                      <Check size={18} />
                      {t('Confirm result', '确认并保存')}
                    </button>
                  </>
                ) : (
                  <span className="saved-status">
                    <CheckCircle2 size={18} />
                    {t('Saved on this device', '已保存在本机')}
                  </span>
                )}
              </div>
            )}
          </section>
        )}
        {page === 'history' && (
          <section className="history-page">
            <div className="page-heading history-heading">
              <div>
                <span className="eyebrow">LOCAL RECORDS</span>
                <h1>{t('History', '检测历史')}</h1>
                <p>
                  {t(
                    `${records.length} records stored on this device.`,
                    `本机共保存 ${records.length} 条检测记录。`,
                  )}
                </p>
              </div>
              <button
                className="button primary"
                disabled={!records.length || busy || exporting}
                onClick={() => openExport('all')}
              >
                <Download size={17} />
                {t('Export all', '全部导出')}
              </button>
            </div>
            <div className="history-controls">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label={t('Search records', '搜索记录')}
                  placeholder={t(
                    'Search name, patient ID or specimen ID',
                    '搜索姓名、患者编号或样本编号',
                  )}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label={t('Filter results', '筛选结果')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">{t('All results', '全部结果')}</option>
                <option value="positive">{t('Positive', '阳性')}</option>
                <option value="negative">{t('Negative', '阴性')}</option>
                <option value="invalid">{t('Invalid', '无效')}</option>
                <option value="unresolved">{t('Unresolved', '待确认')}</option>
              </select>
            </div>
            <div className="selection-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 &&
                    filtered.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    const next = new Set(selected);
                    filtered.forEach((r) =>
                      e.target.checked ? next.add(r.id) : next.delete(r.id),
                    );
                    setSelected(next);
                  }}
                />
                {t('Select visible', '选择当前列表')}
              </label>
              <span>
                {selected.size} {t('selected', '条已选')}
              </span>
              <button
                className="text-button"
                disabled={!selected.size || exporting}
                onClick={() => openExport('selected')}
              >
                <Download size={15} />
                {t('Export selected', '导出所选')}
              </button>
            </div>
            <div className="history-list">
              {filtered.map((record) => (
                <article className="history-record" key={record.id}>
                  <input
                    type="checkbox"
                    aria-label={`${t('Select', '选择')} ${record.patient?.name || record.barcode || record.id}`}
                    checked={selected.has(record.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(record.id);
                      else next.delete(record.id);
                      setSelected(next);
                    }}
                  />
                  <button
                    className="record-open"
                    onClick={() => {
                      setActiveId(record.id);
                      navigate('detail');
                    }}
                  >
                    <span className="record-main">
                      <span className="record-date">
                        {displayTime(record, language)}
                      </span>
                      <strong>
                        {record.patient?.name ||
                          t(
                            'Legacy record · no patient information',
                            '旧版记录 · 未录入患者信息',
                          )}
                      </strong>
                      <span className="record-sub">
                        {record.patient?.patientId || '—'} <i />{' '}
                        {record.patient?.testItem || '—'} <i />{' '}
                        {record.barcode ||
                          t('Specimen ID not decoded', '样本编号未识别')}
                      </span>
                    </span>
                    <span className={`result-chip ${recordTone(record)}`}>
                      {resultText(record, zh)}
                    </span>
                    <ChevronRight size={20} />
                  </button>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <div className="history-empty">
                <History size={35} />
                <h2>
                  {records.length
                    ? t('No matching records', '无匹配记录')
                    : t(
                        'Your history starts with a test.',
                        '完成首次检测后，记录将显示在这里。',
                      )}
                </h2>
                <p>
                  {t(
                    'Patient information and results will stay together here.',
                    '患者信息与检测结果会保存在同一条记录中。',
                  )}
                </p>
                {!records.length && (
                  <button
                    className="button secondary"
                    disabled={blocked}
                    onClick={begin}
                  >
                    {t('Start a test', '开始检测')}
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            )}
            <p className="history-readonly">
              <LockKeyhole size={14} />
              {t(
                'Detection records cannot be edited or deleted.',
                '检测信息不可修改或删除。',
              )}
            </p>
          </section>
        )}
        {page === 'mine' && (
          <MyPage language={language} onLanguage={changeLanguage} />
        )}
      </main>
      <BottomNavigation
        page={page}
        language={language}
        disabled={busy || picking || exporting}
        onNavigate={navigate}
      />
      <CameraDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void processPhoto(file)}
        language={language}
      />
      <ExportDialog
        key={`${exportOpen}-${defaultFormat}`}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        records={exportRecords}
        exporting={exporting}
        onExport={(format, action) => void doExport(format, action)}
        language={language}
        scope={exportScope}
        initialFormat={defaultFormat}
      />
    </div>
  );
}
function UserMark() {
  return (
    <span className="form-icon">
      <ShieldCheck size={23} />
    </span>
  );
}
function PatientDetails({
  record,
  language,
}: {
  record: Inspection;
  language: Language;
}) {
  const zh = language === 'zh';
  const p = record.patient;
  return (
    <>
      {[
        { label: zh ? '患者名字' : 'Patient name', value: p?.name },
        {
          label: zh ? '患者性别' : 'Gender',
          value: p?.gender
            ? {
                male: zh ? '男' : 'Male',
                female: zh ? '女' : 'Female',
                other: zh ? '其他' : 'Other',
              }[p.gender]
            : undefined,
        },
        { label: zh ? '患者年龄' : 'Age', value: p?.age },
        { label: zh ? '患者编号' : 'Patient ID', value: p?.patientId },
        { label: zh ? '联系方式' : 'Contact number', value: p?.contact },
        { label: zh ? '检测项目' : 'Test item', value: p?.testItem },
      ].map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value || '—'}</dd>
        </div>
      ))}
    </>
  );
}
