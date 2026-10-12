'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { cameraLayout } from '@/lib/camera-layout';
import { isAndroid } from '@/lib/native';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function CameraDialog({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="camera-dialog">
        <DialogTitle>对准设备拍照</DialogTitle>
        <DialogDescription>
          将完整机身和试管竖直放入框内，四个指示灯及条码都要清晰可见。
        </DialogDescription>
        {open && <CameraPreview onClose={onClose} onCapture={onCapture} />}
      </DialogContent>
    </Dialog>
  );
}

function CameraPreview({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
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
      setStageSize({ width: element.clientWidth, height: element.clientHeight });
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
      setError('相机未能启动，请检查相机权限后重试，也可关闭后选择照片。');
    }, 20000);

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            isAndroid()
              ? '当前系统 WebView 无法调用相机，请更新 Android System WebView，或关闭后选择照片。'
              : '当前浏览器无法调用相机。请用 Chrome / Safari 打开 HTTPS 或本机 localhost 页面，也可关闭后选择照片。',
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
            setError('相机已中断，请重新开启相机，或关闭后选择照片。');
          });
        });
        if (element) {
          element.srcObject = current;
          await element.play();
        }
        if (cancelled) return;
        clearTimeout(timeout);
        if (element?.videoWidth && element.videoHeight && element.readyState >= 2) {
          setImageSize({ width: element.videoWidth, height: element.videoHeight });
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
              ? '相机权限未开启，请在系统「设置 → 应用 → 检图 → 权限」允许相机，然后重试；也可关闭后选择照片。'
              : '相机权限未开启，请在浏览器中允许使用相机后重试，也可关闭后选择照片。'
            : name === 'NotFoundError'
              ? '没有找到可用摄像头，请连接摄像头或关闭后选择已有照片。'
              : name === 'NotReadableError'
                ? '摄像头无法使用，请关闭占用相机的应用并检查系统相机开关后重试。'
                : e instanceof Error
                  ? e.message
                  : '相机启动失败，请重试或关闭后选择照片。',
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
  }, [facing, restart, suspended]);

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
      if (!context) throw new Error('无法处理相机照片，请重试。');
      context.drawImage(element, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('拍照失败，请重试。')),
          'image/jpeg',
          0.95,
        ),
      );
      if (generation.current !== currentGeneration) return;
      stream.current?.getTracks().forEach((track) => track.stop());
      setReady(false);
      onCapture(
        new File([blob], `拍照-${Date.now()}.jpg`, { type: 'image/jpeg' }),
      );
    } catch (e) {
      if (generation.current === currentGeneration)
        setError(e instanceof Error ? e.message : '拍照失败，请重试。');
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
          aria-label="摄像头实时画面"
          onLoadedData={updateVideoSize}
          onResize={updateVideoSize}
          style={layout ? layout.image : undefined}
        />
        {layout && ready && (
          <div
            className="camera-guide"
            style={layout.guide}
            aria-hidden="true"
          >
            <span className="camera-guide-label">完整设备放入框内</span>
            <svg className="camera-guide-outline" viewBox="0 0 168 400" fill="none">
              <path d="M13 44V13h31M124 13h31v31M155 356v31h-31M44 387H13v-31" />
              <rect className="camera-tube-guide" x="61" y="36" width="46" height="150" rx="8" />
              <rect className="camera-body-guide" x="33" y="175" width="102" height="190" rx="18" />
              <path className="camera-detail-guide" d="M70 92h28M70 100h28M70 108h28M70 116h28" />
              <circle className="camera-detail-guide" cx="53" cy="207" r="5" />
              <circle className="camera-detail-guide" cx="53" cy="235" r="5" />
              <circle className="camera-detail-guide" cx="53" cy="263" r="5" />
              <circle className="camera-detail-guide" cx="53" cy="291" r="5" />
            </svg>
          </div>
        )}
        {!ready && (
          <div className="camera-placeholder" aria-hidden="true">
            <Camera size={38} />
            <span>{suspended ? '相机已暂停' : error ? '相机暂不可用' : '正在开启相机'}</span>
          </div>
        )}
      </div>
      <p className="camera-guide-hint">
        靠近并对焦，避开反光；定位框仅供对齐，照片会保留完整画面。
      </p>
      {error ? (
        <p role="alert" className="camera-error">
          {error}
        </p>
      ) : suspended ? (
        <output>相机已暂停，点击「重新开启」继续拍摄。</output>
      ) : (
        !ready && <output>请允许使用相机，画面出现后即可拍摄…</output>
      )}
      <div className="camera-actions">
        <button className="button secondary" onClick={onClose}>
          关闭
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
            重新开启
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
            切换镜头
          </button>
        )}
        <button
          className="button primary"
          disabled={!ready || shooting || suspended || !!error}
          onClick={() => void capture()}
        >
          <Camera size={16} />
          {shooting ? '正在拍照…' : '拍照并识别'}
        </button>
      </div>
    </>
  );
}
