'use client';
/* oxlint-disable next/no-img-element -- Bundled branding must work offline in the shared Android build. */
import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { cameraLayout } from '@/lib/camera-layout';
import { lampDefinitions } from '@/lib/device-vision';
import { isAndroid } from '@/lib/native';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const cameraCopy = {
  en: {
    title: 'Take Photo',
    description:
      'Keep the complete device and specimen tube upright in the guide. The barcode and all four indicators must be visible.',
    timeout:
      'The camera could not start. Check camera permission and try again.',
    androidUnavailable:
      'This Android System WebView cannot access the camera. Update Android System WebView and try again.',
    browserUnavailable:
      'This browser cannot access the camera. Open the app in Chrome or Safari using HTTPS or localhost.',
    interrupted: 'The camera was interrupted. Restart the camera to continue.',
    androidPermission:
      'Camera permission is off. In system Settings → Apps → GenDX_T → Permissions, allow Camera, then try again.',
    browserPermission:
      'Camera permission is off. Allow camera access in your browser, then try again.',
    missing: 'No camera was found. Connect a camera and try again.',
    busy: 'The camera is unavailable. Close other apps using it and check your system camera settings, then try again.',
    failed: 'The camera could not start. Please try again.',
    processFailed: 'The photo could not be processed. Please try again.',
    captureFailed: 'The photo could not be captured. Please try again.',
    preview: 'Live camera preview',
    guide: 'Fit the complete device inside',
    paused: 'Camera paused',
    unavailable: 'Camera unavailable',
    starting: 'Starting camera',
    hint: 'Align the specimen barcode and indicators with the guide. Move closer, focus, and avoid glare. The complete camera frame will be saved.',
    resume: 'The camera is paused. Select “Restart” to continue.',
    allow:
      'Allow camera access. You can take a photo once the preview appears…',
    close: 'Close',
    restart: 'Restart',
    switch: 'Switch camera',
    shooting: 'Taking photo…',
    capture: 'Take photo',
    specimen: 'Specimen ID',
  },
  zh: {
    title: '拍摄照片',
    description: '将完整机身和试管竖直放入框内，条码及四个指示灯都要清晰可见。',
    timeout: '相机未能启动，请检查相机权限后重试。',
    androidUnavailable:
      '当前系统 WebView 无法调用相机，请更新 Android System WebView 后重试。',
    browserUnavailable:
      '当前浏览器无法调用相机。请用 Chrome / Safari 打开 HTTPS 或本机 localhost 页面。',
    interrupted: '相机已中断，请重新开启相机。',
    androidPermission:
      '相机权限未开启，请在系统「设置 → 应用 → GenDX_T → 权限」允许相机，然后重试。',
    browserPermission: '相机权限未开启，请在浏览器中允许使用相机后重试。',
    missing: '没有找到可用摄像头，请连接摄像头后重试。',
    busy: '摄像头无法使用，请关闭占用相机的应用并检查系统相机开关后重试。',
    failed: '相机启动失败，请重试。',
    processFailed: '无法处理相机照片，请重试。',
    captureFailed: '拍照失败，请重试。',
    preview: '摄像头实时画面',
    guide: '完整设备放入框内',
    paused: '相机已暂停',
    unavailable: '相机暂不可用',
    starting: '正在开启相机',
    hint: '将试管条码及指示灯对齐提示位置，靠近并对焦，避开反光；照片会保留完整画面。',
    resume: '相机已暂停，点击「重新开启」继续拍摄。',
    allow: '请允许使用相机，画面出现后即可拍摄…',
    close: '关闭',
    restart: '重新开启',
    switch: '切换镜头',
    shooting: '正在拍照…',
    capture: '拍摄照片',
    specimen: '样本编号',
  },
} as const;

export function CameraDialog({
  open,
  onClose,
  onCapture,
  language = 'en',
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  language?: 'en' | 'zh';
}) {
  const copy = cameraCopy[language];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="camera-dialog">
        <img
          className="dialog-brand"
          src="/brand/gendx-logo-compact.png"
          alt="GenDx"
        />
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
        {open && (
          <CameraPreview
            onClose={onClose}
            onCapture={onCapture}
            language={language}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CameraPreview({
  onClose,
  onCapture,
  language,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
  language: 'en' | 'zh';
}) {
  const copy = cameraCopy[language];
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const capturing = useRef(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [error, setError] = useState('');
  const [restart, setRestart] = useState(0);
  const [suspended, setSuspended] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const layout = cameraLayout(
    stageSize.width,
    stageSize.height,
    imageSize.width,
    imageSize.height,
  );

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () =>
      setStageSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Returning from another app requires an explicit resume, keeping the camera off
    // while the user is away and avoiding a stale frame after Android pauses WebView.
    const suspend = () => {
      generation.current += 1;
      stream.current?.getTracks().forEach((track) => track.stop());
      setReady(false);
      setShooting(false);
      setError('');
      setImageSize({ width: 0, height: 0 });
      setSuspended(true);
    };
    const pause = () => {
      if (document.hidden) suspend();
    };
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('pagehide', suspend);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      window.removeEventListener('pagehide', suspend);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let current: MediaStream | undefined;
    const element = video.current;
    generation.current += 1;
    if (suspended) return;
    const timeout = setTimeout(() => {
      cancelled = true;
      current?.getTracks().forEach((track) => track.stop());
      setReady(false);
      setError(copy.timeout);
    }, 20000);

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            isAndroid() ? copy.androidUnavailable : copy.browserUnavailable,
          );
        current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        });
        if (cancelled) {
          current.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = current;
        current.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (cancelled) return;
            setReady(false);
            setError(copy.interrupted);
          });
        });
        if (element) {
          element.srcObject = current;
          await element.play();
        }
        if (cancelled) return;
        clearTimeout(timeout);
        if (
          element?.videoWidth &&
          element.videoHeight &&
          element.readyState >= 2
        ) {
          setImageSize({
            width: element.videoWidth,
            height: element.videoHeight,
          });
          setReady(true);
        }
      } catch (e) {
        clearTimeout(timeout);
        current?.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        const name = e instanceof Error ? e.name : '';
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? isAndroid()
              ? copy.androidPermission
              : copy.browserPermission
            : name === 'NotFoundError'
              ? copy.missing
              : name === 'NotReadableError'
                ? copy.busy
                : e instanceof Error
                  ? e.message
                  : copy.failed,
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      generation.current += 1;
      clearTimeout(timeout);
      current?.getTracks().forEach((track) => track.stop());
      if (element && element.srcObject === current) element.srcObject = null;
      stream.current = null;
    };
  }, [facing, restart, suspended, copy]);

  function updateVideoSize() {
    const element = video.current;
    if (
      stream.current?.active &&
      element?.srcObject === stream.current &&
      element?.videoWidth &&
      element.videoHeight
    ) {
      setImageSize({ width: element.videoWidth, height: element.videoHeight });
      if (element.readyState >= 2) setReady(true);
    }
  }

  async function capture() {
    const element = video.current;
    if (
      !element ||
      !ready ||
      suspended ||
      capturing.current ||
      !element.videoWidth ||
      !element.videoHeight
    )
      return;
    capturing.current = true;
    setShooting(true);
    setError('');
    const currentGeneration = generation.current;
    const canvas = document.createElement('canvas');
    try {
      // The guide is only a positioning aid: save every pixel from the live frame.
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(copy.processFailed);
      context.drawImage(element, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error(copy.captureFailed)),
          'image/jpeg',
          0.95,
        ),
      );
      if (generation.current !== currentGeneration) return;
      stream.current?.getTracks().forEach((track) => track.stop());
      setReady(false);
      onCapture(
        new File([blob], `GenDX_T-photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        }),
      );
    } catch (e) {
      if (generation.current === currentGeneration)
        setError(e instanceof Error ? e.message : copy.captureFailed);
    } finally {
      canvas.width = canvas.height = 0;
      capturing.current = false;
      if (generation.current === currentGeneration) setShooting(false);
    }
  }

  return (
    <>
      <div className="camera-stage" ref={stage}>
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="camera-preview"
          aria-label={copy.preview}
          onLoadedData={updateVideoSize}
          onResize={updateVideoSize}
          style={layout ? layout.image : undefined}
        />
        {layout && ready && (
          <div className="camera-guide" style={layout.guide} aria-hidden="true">
            <span className="camera-guide-label">{copy.guide}</span>
            <svg
              className="camera-guide-outline"
              viewBox="0 0 168 400"
              fill="none"
            >
              <path d="M13 44V13h31M124 13h31v31M155 356v31h-31M44 387H13v-31" />
              <rect
                className="camera-tube-guide"
                x="61"
                y="36"
                width="46"
                height="150"
                rx="8"
              />
              <rect
                className="camera-body-guide"
                x="33"
                y="175"
                width="102"
                height="190"
                rx="18"
              />
              <path
                className="camera-detail-guide"
                d="M71 77v61M76 77v61M81 77v61M88 77v61M93 77v61M98 77v61"
              />
              <text
                x="84"
                y="154"
                textAnchor="middle"
                fontSize="8"
                fill="white"
                stroke="none"
              >
                {copy.specimen}
              </text>
              {lampDefinitions.map((lamp) => {
                const x = 33 + lamp.x * 102;
                const y = 175 + lamp.y * 190;
                const upper =
                  lamp.key === 'negative' || lamp.key === 'positive';
                return (
                  <g key={lamp.key}>
                    <rect
                      className="camera-detail-guide"
                      x={x - 4}
                      y={y - 4}
                      width="8"
                      height="8"
                      rx="1"
                    />
                    <text
                      x={upper ? x + (lamp.key === 'negative' ? -2 : 2) : x + 9}
                      y={upper ? y + 16 : y + 3}
                      textAnchor={lamp.key === 'negative' ? 'end' : 'start'}
                      fontSize="7.5"
                      fill="white"
                      stroke="none"
                    >
                      {lamp.label.replace(/^[−+] /, '')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        {!ready && (
          <div className="camera-placeholder" aria-hidden="true">
            <Camera size={38} />
            <span>
              {suspended
                ? copy.paused
                : error
                  ? copy.unavailable
                  : copy.starting}
            </span>
          </div>
        )}
      </div>
      <p className="camera-guide-hint">{copy.hint}</p>
      {error ? (
        <p role="alert" className="camera-error">
          {error}
        </p>
      ) : suspended ? (
        <output>{copy.resume}</output>
      ) : (
        !ready && <output>{copy.allow}</output>
      )}
      <div className="camera-actions">
        <button className="button secondary" onClick={onClose}>
          {copy.close}
        </button>
        {error || suspended ? (
          <button
            className="button secondary"
            onClick={() => {
              setReady(false);
              setShooting(false);
              setError('');
              setImageSize({ width: 0, height: 0 });
              setSuspended(false);
              setRestart((value) => value + 1);
            }}
          >
            <RefreshCw size={16} />
            {copy.restart}
          </button>
        ) : (
          <button
            className="button secondary"
            disabled={!ready || shooting}
            onClick={() => {
              setReady(false);
              setImageSize({ width: 0, height: 0 });
              setFacing(facing === 'environment' ? 'user' : 'environment');
            }}
          >
            <RefreshCw size={16} />
            {copy.switch}
          </button>
        )}
        <button
          className="button primary"
          disabled={!ready || shooting || suspended || !!error}
          onClick={() => void capture()}
        >
          <Camera size={16} />
          {shooting ? copy.shooting : copy.capture}
        </button>
      </div>
    </>
  );
}
